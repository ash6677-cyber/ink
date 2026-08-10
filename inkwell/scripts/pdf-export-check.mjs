/**
 * Print-ready PDF export, proven live: the export dialog offers "PDF
 * (print-ready)", and choosing it downloads a real PDF — %PDF header,
 * 6×9in pages (432×648 pt MediaBox), one page per chapter opener plus
 * the title page, with the manuscript's words inside.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/pdf-export-check.mjs
 */
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

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
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(700)
await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const doc = (paras) => ({ type: 'doc', content: paras.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) })
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'The Printed Book', author: 'A. Writer', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const sentence = 'The road climbed slowly out of the valley and the light went long and thin across the frost. '
  const chapters = [
    { title: 'Chapter One', paras: Array.from({ length: 12 }, () => sentence.repeat(6).trim()) },
    { title: 'Chapter Two', paras: Array.from({ length: 8 }, () => sentence.repeat(5).trim()) },
  ]
  let order = 0
  for (const ch of chapters) {
    const cid = id('ch')
    await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: ch.title, order, status: 'drafting' })
    await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: 'Scene 1', order: 0, content: doc(ch.paras), plainText: ch.paras.join('\n\n'), wordCount: 600, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
    order++
  }
  db.close()
})
await page.reload()
await eventually(async () => (await page.getByText('The Printed Book').count()) > 0)

// Open the project card's menu → Export…
const card = page.locator('[class*=group]', { hasText: 'The Printed Book' }).first()
await card.hover()
await page.getByLabel(/More actions/i).first().click()
await page.getByText('Export…').click()
await eventually(async () => (await page.getByText('PDF (print-ready)').count()) > 0)
check('the dialog offers PDF (print-ready)', true, true)
check(
  'the option says what it is: 6×9 book pages',
  true,
  (await page.getByText(/6×9 inch book pages/).count()) > 0,
)

await page.getByText('PDF (print-ready)').click()
const downloadPromise = page.waitForEvent('download', { timeout: 20000 })
await page.getByRole('button', { name: /^Export$/ }).click()
const download = await downloadPromise
const path = await download.path()
const bytes = readFileSync(path)

check('the file is named after the book', 'The-Printed-Book.pdf', download.suggestedFilename())
check('it is a real PDF', '%PDF', bytes.subarray(0, 4).toString('latin1'))

const raw = bytes.toString('latin1')
const pageCount = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length
check('title page + two chapters means at least 3 pages', true, pageCount >= 3, `${pageCount} pages`)
check(
  'pages are 6×9 inches (432×648 pt)',
  true,
  /MediaBox\s*\[\s*0\s+0\s+432\.?\d*\s+648\.?\d*\s*\]/.test(raw),
)

// The words themselves live in flate-compressed streams; inflate and look.
let sawTitle = false
let sawProse = false
const streamRe = /stream\r?\n([\s\S]*?)endstream/g
for (const match of raw.matchAll(streamRe)) {
  try {
    const inflated = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1')
    if (inflated.includes('The Printed Book')) sawTitle = true
    if (inflated.includes('valley')) sawProse = true
  } catch { /* not a flate stream */ }
}
check('the title page carries the title', true, sawTitle)
check('the prose made it onto the pages', true, sawProse)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
