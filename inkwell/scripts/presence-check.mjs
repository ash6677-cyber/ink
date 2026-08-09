/**
 * Character presence index, proven live: an Almanac entry's detail page
 * must show a per-chapter presence strip and name the longest stretch the
 * character vanishes — the gap a scene list can't reveal.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/presence-check.mjs
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
const eventually = async (p, t = 15000) => {
  const d = Date.now() + t
  for (;;) {
    const v = await p()
    if (v) return v
    if (Date.now() > d) return false
    await new Promise((r) => setTimeout(r, 200))
  }
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(900)
const ids = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
  const words = (n, w) => Array.from({ length: n }, () => w).join(' ')
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Presence Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  // Five chapters. Marta appears in ch1 and ch5, absent through 2–4.
  const texts = [
    'Marta walked the shore. ' + words(200, 'sand'),
    words(300, 'sea'),
    words(300, 'wind'),
    words(300, 'rain'),
    'And Marta returned at last. ' + words(200, 'home'),
  ]
  for (let c = 0; c < 5; c++) {
    const cid = id('ch')
    await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: `Chapter ${c + 1}`, order: c, status: 'draft' })
    const t = texts[c]
    await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: 'Scene 1', order: 0, content: doc(t), plainText: t, wordCount: t.split(/\s+/).length, status: 'draft', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
  }
  const marta = id('codex')
  await put('codexEntries', { id: marta, createdAt: now, updatedAt: now, projectId: pid, seriesId: null, type: 'character', name: 'Marta', aliases: [], summary: '', body: null, plainText: '', attributes: [], relationships: [], imageId: null, tags: [], aiContext: 'auto', aiContextTokenBudget: null })
  db.close()
  return { pid, marta }
})

await page.goto(`${BASE}#/almanac/${ids.marta}?project=${ids.pid}`)
await eventually(async () => (await page.getByText('Presence across the book').count()) > 0)
check('the presence strip appears on the entry', true, true)

check(
  'it reports how many chapters name the character',
  true,
  (await page.getByText('2 of 5 chapters').count()) > 0,
)

// ch2+ch3+ch4 ≈ 900 words absent between the two appearances.
const absence = await eventually(async () => (await page.getByText(/Absent for [\d,]+ words/).count()) > 0)
check('it names the longest absence in words', true, absence)
const absenceText = await page.getByText(/Absent for [\d,]+ words/).first().innerText()
check('the absence spans the middle chapters', true, /Chapter 2.*Chapter 4/.test(absenceText), absenceText)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
