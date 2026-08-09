/**
 * Style tics, proven live: the watchlist a writer curates in Settings must
 * light up their over-used words in the editor — on whole-word boundaries,
 * never inside a larger word — and update the moment the list changes.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/style-tics-check.mjs
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
    await new Promise((r) => setTimeout(r, 250))
  }
}

const SCENE = 'He just adjusted his coat. She just sighed, and it was just so — very, very still.'

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

// Seed the watchlist into the persisted preferences before the app boots.
// Seed ONCE — an init script runs on every navigation, so a flag stops it
// re-seeding (and clobbering) the watchlist edit made later in the test.
await ctx.addInitScript((tics) => {
  if (localStorage.getItem('inkwell-prefs-seeded')) return
  localStorage.setItem('inkwell-prefs-seeded', '1')
  localStorage.setItem(
    'inkwell-preferences',
    JSON.stringify({ state: { styleTics: tics, backupSnoozedUntil: Date.now() + 8.64e7 }, version: 0 }),
  )
}, ['just', 'very'])

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(900)
const projectId = await page.evaluate(async (sceneText) => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Tics Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const cid = id('ch')
  await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: 'Chapter 1', order: 0, status: 'draft' })
  await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: 'Scene 1', order: 0, content: doc(sceneText), plainText: sceneText, wordCount: sceneText.split(/\s+/).length, status: 'draft', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
  db.close()
  return pid
}, SCENE)

await page.goto(`${BASE}#/editor?project=${projectId}`)
await eventually(async () => (await page.locator('.editor-prose').count()) > 0)
await page.waitForTimeout(1200)

const marks = await page.locator('.tic-highlight').allInnerTexts()
// "just" ×3 and "very" ×2 = 5 marks; the "just" inside "adjusted" must NOT count.
check('the watchlist words are highlighted', 5, marks.length, marks.join(','))
check('every highlight is a watchword, never a fragment', true,
  marks.every((m) => ['just', 'very'].includes(m.toLowerCase())), marks.join(','))
check('the "just" inside "adjusted" is not highlighted', false,
  await page.evaluate(() => [...document.querySelectorAll('.tic-highlight')].some((n) => n.textContent === 'adjusted')))

// Change the watchlist live (as the Settings textarea would) — highlights follow.
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('inkwell-preferences'))
  raw.state.styleTics = ['still']
  localStorage.setItem('inkwell-preferences', JSON.stringify(raw))
})
await page.reload()
await eventually(async () => (await page.locator('.editor-prose').count()) > 0)
await page.waitForTimeout(1000)
const afterMarks = await page.locator('.tic-highlight').allInnerTexts()
check('editing the watchlist re-highlights accordingly', ['still'], afterMarks)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
