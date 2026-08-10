/**
 * Pacing heatmap, proven live: seed a book with one brisk dialogue scene,
 * three long quiet scenes in a row, and one short closer — the Pacing tab
 * must render the strip with the right legend counts, flag the three-scene
 * slow stretch by name, and clicking a block must land in the editor on
 * that scene.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/pacing-check.mjs
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

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(800)
const ids = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
  // Long quiet prose: no quotes, ~26-word sentences.
  const quiet = (words) => {
    const s = 'The river moved past the old stone bridge without hurry while the town behind it slept on under a sky the colour of unpolished tin and regret.'
    const per = s.split(' ').length
    return Array.from({ length: Math.ceil(words / per) }, () => s).join(' ')
  }
  // Chatty prose: about half the words spoken, short sentences.
  const chatty = (words) => {
    const u = '"We go now." She nodded once. "Fine then." He grabbed the coat quickly.'
    const per = u.split(/\s+/).length
    return Array.from({ length: Math.ceil(words / per) }, () => u).join(' ')
  }
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Tempo Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const mkCh = async (title, order) => {
    const cid = id('ch')
    await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title, order, status: 'drafting' })
    return cid
  }
  const c1 = await mkCh('Chapter 1', 0)
  const c2 = await mkCh('Chapter 2', 1)
  const mk = async (cid, title, text, order) => {
    const sid = id('sc')
    await put('scenes', { id: sid, createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title, order, content: doc(text), plainText: text, wordCount: text.split(/\s+/).length, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
    return sid
  }
  const opener = await mk(c1, 'The Argument', chatty(500), 0)
  await mk(c1, 'The Long Watch', quiet(1800), 1)
  await mk(c2, 'The Vigil', quiet(1700), 0)
  await mk(c2, 'The Slow Thaw', quiet(1900), 1)
  await mk(c2, 'The Knock', chatty(200), 2)
  db.close()
  return { pid, opener }
})

// ---- The Pacing tab renders the strip. ----
await page.goto(`${BASE}#/planning?project=${ids.pid}`)
await eventually(async () => (await page.getByRole('tab', { name: 'Pacing' }).count()) > 0)
await page.getByRole('tab', { name: 'Pacing' }).click()
await eventually(async () => (await page.locator('[data-pacing]').count()) > 0)
check('the Pacing tab renders the strip', true, true)

const legend = await page.locator('[data-pacing]').innerText()
check('legend counts two brisk scenes', true, /Brisk · 2/.test(legend))
check('legend counts three slow scenes', true, /Slow · 3/.test(legend))
check('legend shows the median yardstick', true, /median scene/.test(legend))

const blocks = await page.locator('[data-pacing] button[aria-label]').count()
check('one block per scene', 5, blocks)
check('both chapters divide the strip', true, /Chapter 1[\s\S]*Chapter 2/.test(legend))

// ---- The three-scene slow stretch is flagged by name. ----
const stretch = await page.locator('[data-pacing-stretches]').innerText()
check('the slow stretch is flagged', true, /3 slow scenes in a row/.test(stretch))
check('the stretch names its scenes', true,
  /The Long Watch/.test(stretch) && /The Vigil/.test(stretch) && /The Slow Thaw/.test(stretch))

// ---- A block is a door: clicking opens that scene in the editor. ----
await page.getByRole('button', { name: /The Argument, brisk/ }).click()
const landed = await eventually(async () => page.url().includes(`scene=${ids.opener}`))
check('clicking a block opens the scene in the editor', true, landed)

await page.screenshot({ path: process.env.SCREENSHOT_PATH ?? '/tmp/pacing-editor.png' })
check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
