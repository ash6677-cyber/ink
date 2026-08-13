/**
 * World bible, proven live: seed an Almanac — two characters (one with a
 * real painted portrait), a place, a relationship, and a dated scene —
 * click the Almanac's "World bible" button, and the downloaded PDF must
 * be a real typeset document: title page named after the book, a
 * Characters section opener, an entry page per entry, the relationship
 * web, the timeline, and an actual embedded image object for the
 * portrait.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/world-bible-check.mjs
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
const eventually = async (p, t = 20000) => {
  const d = Date.now() + t
  for (;;) {
    const v = await p()
    if (v) return v
    if (Date.now() > d) return false
    await new Promise((r) => setTimeout(r, 300))
  }
}

/** Every FlateDecode stream in the PDF, inflated and concatenated. */
function pdfText(buffer) {
  const raw = buffer.toString('latin1')
  let out = ''
  const streamRe = /stream\r?\n/g
  let match
  while ((match = streamRe.exec(raw)) !== null) {
    const start = match.index + match[0].length
    const end = raw.indexOf('endstream', start)
    if (end === -1) continue
    const bytes = Buffer.from(raw.slice(start, end), 'latin1')
    try {
      out += inflateSync(bytes).toString('latin1')
    } catch {
      /* image or already-plain stream */
    }
  }
  return out
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

  // A real image: a 60×90 painted canvas, stored the way uploads are.
  const canvas = document.createElement('canvas')
  canvas.width = 60
  canvas.height = 90
  const g = canvas.getContext('2d')
  g.fillStyle = '#7a5c3e'
  g.fillRect(0, 0, 60, 90)
  g.fillStyle = '#e8d9c0'
  g.beginPath()
  g.arc(30, 34, 16, 0, Math.PI * 2)
  g.fill()
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  const imgId = id('img')
  await put('imageAssets', { id: imgId, createdAt: now, updatedAt: now, mimeType: 'image/png', width: 60, height: 90, fileName: 'marta.png', blob })

  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'The Two Rivers', author: 'A. Writer', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const cid = id('ch')
  await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: 'Chapter 1', order: 0, status: 'drafting' })
  await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: 'The Crossing', order: 0, content: doc('They crossed at dawn.'), plainText: 'They crossed at dawn.', wordCount: 4, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [], storyDay: 3 })

  const mkEntry = async (type, name, extra = {}) => {
    const eid = id('cx')
    await put('codexEntries', { id: eid, createdAt: now, updatedAt: now, projectId: pid, seriesId: null, type, name, aliases: [], summary: '', body: null, plainText: '', attributes: [], relationships: [], imageId: null, tags: [], aiContext: 'when-relevant', aiContextTokenBudget: null, ...extra })
    return eid
  }
  const marta = await mkEntry('character', 'Marta', { imageId: imgId, summary: 'Keeps the ford.', attributes: [{ id: id('a'), key: 'Eyes', value: 'grey' }] })
  await mkEntry('character', 'Bram', { relationships: [{ id: id('r'), targetEntryId: marta, label: 'Brother of' }] })
  await mkEntry('location', 'The Ford', { summary: 'Where the two rivers meet.' })
  db.close()
  return { pid }
})

// ---- Build the bible through the real button. ----
await page.goto(`${BASE}#/almanac?project=${ids.pid}`)
await eventually(async () => (await page.getByRole('button', { name: 'World bible' }).count()) > 0)
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'World bible' }).click(),
])
const dir = mkdtempSync(join(tmpdir(), 'inkwell-bible-'))
const file = join(dir, download.suggestedFilename())
await download.saveAs(file)
check('the file names itself after the book', 'The-Two-Rivers-world-bible.pdf', download.suggestedFilename())

const buffer = readFileSync(file)
check('it is a real PDF', true, buffer.subarray(0, 5).toString() === '%PDF-')
const text = pdfText(buffer)

check('the title page names the world', true, /The Two Rivers: The World/.test(text))
check('the Characters section opens with its contents', true,
  /Characters/.test(text) && /Keeps the ford\./.test(text))
check('every entry has its page', true,
  /Marta/.test(text) && /Bram/.test(text) && /The Ford/.test(text))
check('attributes are typeset', true, /Eyes: grey/.test(text))
check('the relationship web is compiled', true,
  /The Web of Relationships/.test(text) && /Brother of/.test(text))
check('the timeline closes the bible', true,
  /The Timeline/.test(text) && /Day 3 - The Crossing/.test(text))
check('the portrait is embedded as a real image object', true,
  /\/XObject/.test(buffer.toString('latin1')) && /\/Image/.test(buffer.toString('latin1')))
check('the toast reports the honest entry count', true,
  (await eventually(async () => (await page.getByText('3 entries, typeset').count()) > 0)) !== false)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
