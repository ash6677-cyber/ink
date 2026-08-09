/**
 * Project-wide find & replace, proven live.
 *
 * The feature already existed (manuscript search panel + bulkReplaceAcrossScenes)
 * but its Tiptap-document rewrite had no automated coverage — and it edits the
 * manuscript irreversibly, so it earns a real end-to-end proof: seed two
 * scenes sharing a word, search the whole book, preview the per-scene hits,
 * replace all, and confirm every scene changed and the count was honest.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/find-replace-check.mjs
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

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(900)
const projectId = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Colour Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  for (let c = 0; c < 2; c++) {
    const cid = id('ch')
    await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: `Chapter ${c + 1}`, order: c, status: 'draft' })
    const text = c === 0
      ? 'The grey sky met the grey sea and the grey gulls cried.'
      : 'She wore grey wool against the grey morning.'
    await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: 'Scene 1', order: 0, content: doc(text), plainText: text, wordCount: text.split(/\s+/).length, status: 'draft', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
  }
  db.close()
  return pid
})

await page.goto(`${BASE}#/editor?project=${projectId}`)
await page.waitForTimeout(1500)
// Open the manuscript search panel by its shortcut (Mod+Shift+F).
await page.keyboard.press('Control+Shift+KeyF')
const panelUp = await eventually(async () => (await page.getByRole('heading', { name: 'Search manuscript' }).count()) > 0)
check('the manuscript search panel opens', true, panelUp)

await page.getByPlaceholder('Search across every scene…').fill('grey')
await page.waitForTimeout(500)
// Three "grey" in scene one, two in scene two → two scenes, five occurrences,
// each shown with its count as a preview before anything changes.
const previewScenes = await page.getByText(/\d+ match/).count()
check('every matching scene is previewed before replacing', 2, previewScenes)

await page.getByRole('button', { name: 'Replace across manuscript…' }).click()
await page.getByPlaceholder('Replace with').fill('gray')
await page.getByRole('button', { name: 'Replace all' }).first().click()
const confirmUp = await eventually(async () => (await page.getByText(/This replaces all 5 occurrence/).count()) > 0)
check('the confirm step names the exact count before touching anything', true, confirmUp)

await page.getByRole('button', { name: 'Replace all' }).last().click()
const done = await eventually(async () => (await page.getByText(/Replaced 5 occurrences across 2 scenes/).count()) > 0)
check('replace-all reports five occurrences across two scenes', true, done)

// The manuscript on disk must actually carry the new word and none of the old.
await page.waitForTimeout(600)
const onDisk = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const all = await new Promise((res) => {
    const out = []
    const cur = db.transaction('scenes', 'readonly').objectStore('scenes').openCursor()
    cur.onsuccess = (e) => { const c = e.target.result; if (c) { out.push(c.value); c.continue() } else res(out) }
  })
  db.close()
  const text = all.map((s) => s.plainText).join(' ')
  return { grays: (text.match(/gray/g) || []).length, greys: (text.match(/grey/g) || []).length }
})
check('the manuscript now reads "gray" five times', 5, onDisk.grays)
check('…and not a single "grey" survives', 0, onDisk.greys)
check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
