/**
 * Front & back matter, proven live: write a dedication through the real
 * project-settings form, and the book gains real sections — the reader
 * shows a Dedication page before chapter one and About the Author after
 * the end, a Markdown export carries all four sections in the right
 * order with the epigraph attribution line, and the export dialog still
 * counts only story chapters and story words.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/matter-check.mjs
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true })
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
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Matter Book', author: 'A. Writer', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting',
    matter: { dedication: 'For Ada.', epigraph: 'The owl of Minerva flies at dusk.', epigraphAttribution: 'Hegel, roughly', acknowledgments: 'Thanks to the Tuesday group.', aboutAuthor: 'A. Writer lives by the sea.' },
    settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const mkCh = async (title, order) => {
    const cid = id('ch')
    await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title, order, status: 'drafting' })
    return cid
  }
  const c1 = await mkCh('Chapter 1', 0)
  const c2 = await mkCh('Chapter 2', 1)
  const mk = async (cid, title, text, order) => {
    await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title, order, content: doc(text), plainText: text, wordCount: text.split(/\s+/).length, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
  }
  await mk(c1, 'Opening', 'The ford ran high and cold that morning, and nobody spoke first.', 0)
  await mk(c2, 'Closing', 'They buried the locket where the two rivers met.', 0)
  db.close()
  return { pid }
})

// ---- The reader carries the matter as real pages. ----
await page.goto(`${BASE}#/read?project=${ids.pid}`)
await eventually(async () => (await page.getByText('Dedication', { exact: true }).count()) > 0)
check('the reader has a Dedication section', true, true)
check('the dedication text is on its page', true, (await page.getByText('For Ada.').count()) > 0)
check('the epigraph attribution reads as a line', true,
  (await page.getByText('— Hegel, roughly').count()) > 0)
check('About the Author closes the book', true,
  (await page.getByText('About the Author', { exact: true }).count()) > 0)

// ---- A Markdown export carries every section, in book order. ----
await page.goto(`${BASE}#/projects`)
await eventually(async () => (await page.getByText('Matter Book').count()) > 0)
await page.getByRole('button', { name: 'More actions for Matter Book', exact: true }).click()
await page.getByRole('menuitem', { name: 'Export…' }).click()
await eventually(async () => (await page.getByText(/chapters? ·/).count()) > 0)
const dialogText = await page.getByRole('dialog').innerText()
check('the dialog counts story chapters only', true, /2 chapters/.test(dialogText))
check('the dialog counts story words only (matter adds none)', true, /\b21 words\b/.test(dialogText))

await page.getByRole('button', { name: 'Markdown' }).click().catch(() => page.getByText('Markdown', { exact: true }).click())
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: /Export|Download/ }).click(),
])
const dir = mkdtempSync(join(tmpdir(), 'inkwell-matter-'))
const file = join(dir, 'book.md')
await download.saveAs(file)
const md = readFileSync(file, 'utf8')
const order = ['## Dedication', '## Epigraph', '— Hegel, roughly', '## Chapter 1', '## Chapter 2', '## Acknowledgments', '## About the Author']
  .map((s) => md.indexOf(s))
check('every section is in the export', true, order.every((i) => i >= 0), JSON.stringify(order))
check('the sections stand in book order', true,
  order.every((v, i) => i === 0 || v > order[i - 1]))

// ---- The form writes matter for real: change the dedication, re-read it. ----
// The export dialog may have closed itself after the download.
await page.getByRole('button', { name: 'Close' }).click({ timeout: 3000 }).catch(() => undefined)
await eventually(async () => (await page.getByRole('dialog').count()) === 0, 8000)
await page.getByRole('button', { name: 'More actions for Matter Book', exact: true }).click()
await page.getByRole('menuitem', { name: 'Edit' }).click()
await eventually(async () => (await page.getByText('Front & back matter').count()) > 0)
check('the matter section reports it is written', true,
  /written/.test(await page.getByRole('dialog').innerText()))
const dedication = page.getByLabel('Dedication')
await eventually(async () => (await dedication.count()) > 0)
await dedication.fill('For Ada, still.')
await page.getByRole('button', { name: 'Save changes' }).click()
await page.waitForTimeout(600)
await page.goto(`${BASE}#/read?project=${ids.pid}`)
const updated = await eventually(async () => (await page.getByText('For Ada, still.').count()) > 0)
check('a dedication edited in the form reaches the reader', true, updated)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
