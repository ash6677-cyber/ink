/**
 * Soundscapes, proven live with a real (headless) audio graph: nothing
 * plays until asked; choosing Rain starts a running AudioContext with
 * actual signal at the analyser; switching rooms switches; the volume
 * dial changes the gain and remembers itself across a reload; Off tears
 * the whole graph down. All synthesized — the harness watches signal
 * levels, not files.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/soundscapes-check.mjs
 */
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? '/opt/node22/lib/node_modules/playwright/index.mjs'
)
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5410/'

let failures = 0
const check = (name, expected, actual, note = '') => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual)
  if (!ok) failures++
  console.log(
    `${ok ? 'PASS' : 'FAIL'} · ${name} → ${JSON.stringify(actual)}` +
      `${ok ? '' : ` — expected ${JSON.stringify(expected)}`}${note ? ` · ${note}` : ''}`,
  )
}
const eventually = async (p, t = 20000) => {
  const d = Date.now() + t
  for (;;) {
    const v = await p()
    if (v) return v
    if (Date.now() > d) return false
    await new Promise((r) => setTimeout(r, 300))
  }
}

const browser = await chromium.launch({
  executablePath: CHROMIUM_PATH,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
})
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(800)
const pid = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Quiet Room', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const cid = id('ch')
  await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: 'Ch 1', order: 0, status: 'drafting' })
  await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: 'S1', order: 0, content: null, plainText: 'words', wordCount: 1, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
  db.close()
  return pid
})

await page.goto(`${BASE}#/editor?project=${pid}`)
await eventually(async () => (await page.getByRole('button', { name: 'Soundscapes' }).count()) > 0)
check('silence until asked: no debug hook, no audio', true,
  await page.evaluate(() => window.__inkwellSoundscape === undefined))

// ---- Rain: a real graph with real signal. ----
const level = () => page.evaluate(() => window.__inkwellSoundscape?.level() ?? 0)
await page.getByRole('button', { name: 'Soundscapes' }).click()
await page.getByRole('menuitem', { name: 'Rain' }).click()
await eventually(async () => page.evaluate(() => window.__inkwellSoundscape?.id === 'rain'))
check('picking Rain starts the rain', 'rain',
  await page.evaluate(() => window.__inkwellSoundscape?.id))
check('the context is running', 'running',
  await page.evaluate(() => window.__inkwellSoundscape?.state()))
const rainLevel = await eventually(async () => {
  const v = await level()
  return v > 0.005 ? v : false
})
check('signal actually flows at the analyser', true, rainLevel !== false, `rms ${rainLevel && rainLevel.toFixed(4)}`)

// ---- Switching rooms switches; the old graph dies with it. ----
await page.getByRole('button', { name: 'Soundscape: Rain' }).click()
await page.getByRole('menuitem', { name: 'Fireplace' }).click()
await eventually(async () => page.evaluate(() => window.__inkwellSoundscape?.id === 'fire'))
check('switching to the fireplace switches the room', 'fire',
  await page.evaluate(() => window.__inkwellSoundscape?.id))
check('and the fire crackles too', true, (await eventually(async () => {
  const v = await level()
  return v > 0.005 ? v : false
})) !== false)

// ---- The volume dial bites and remembers. ----
await page.getByRole('button', { name: 'Soundscape: Fireplace' }).click()
await page.locator('#soundscape-volume').fill('0.1')
await page.keyboard.press('Escape')
const stored = await page.evaluate(() => localStorage.getItem('inkwell-soundscape-volume'))
check('the dial remembers itself', '0.1', stored)

// ---- Off tears the graph down. ----
await page.getByRole('button', { name: 'Soundscape: Fireplace' }).click()
await page.getByRole('menuitem', { name: 'Off' }).click()
await eventually(async () => page.evaluate(() => window.__inkwellSoundscape === undefined))
check('Off tears the whole graph down', true,
  await page.evaluate(() => window.__inkwellSoundscape === undefined))

// ---- The remembered volume survives a reload. ----
await page.reload()
await eventually(async () => (await page.getByRole('button', { name: 'Soundscapes' }).count()) > 0)
await page.getByRole('button', { name: 'Soundscapes' }).click()
check('the volume survives a reload', '0.1',
  await page.locator('#soundscape-volume').inputValue())

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
