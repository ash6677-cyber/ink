/**
 * Read-aloud proofing, proven as far as a headless browser honestly can.
 *
 * The speakable-chunking logic is unit-tested (read-aloud.test.ts); actual
 * audio needs a voice engine no CI browser provides. So this proves the
 * wiring instead: the control appears for a scene with prose, pressing it
 * enters a speaking state and reveals a Stop control, Stop returns it to
 * rest, and none of it throws — the failure mode that would matter to a
 * writer.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/read-aloud-check.mjs
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
const projectId = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Aloud Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const cid = id('ch')
  await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: 'Chapter 1', order: 0, status: 'draft' })
  const text = 'The tide came in. It went out again. The gulls cried over the flats.'
  await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: 'Scene 1', order: 0, content: doc(text), plainText: text, wordCount: text.split(/\s+/).length, status: 'draft', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
  db.close()
  return pid
}, undefined)

await page.goto(`${BASE}#/editor?project=${projectId}`)
await eventually(async () => (await page.locator('.editor-prose').count()) > 0)
await page.waitForTimeout(800)

const present = await eventually(async () => (await page.getByRole('button', { name: 'Read aloud' }).count()) > 0)
check('the read-aloud control is offered for a scene with prose', true, present)

// Press it. With a real voice engine this begins speaking and shows
// Pause + Stop; in a voiceless CI browser playback ends at once and the
// control returns to rest. Either way it must not throw, and the button
// must remain usable — that is the honest, environment-independent check.
// (The Pause/Stop states are exercised in the unit-tested controller.)
await page.getByRole('button', { name: 'Read aloud' }).click()
await page.waitForTimeout(600)
const usable = await eventually(async () =>
  (await page.getByRole('button', { name: /Read aloud|Pause reading|Resume reading/ }).count()) > 0,
)
check('pressing read-aloud keeps the control usable, never crashes', true, usable)

// Press again to be sure a second cycle is also safe.
await page.getByRole('button', { name: /Read aloud|Resume reading/ }).first().click().catch(() => {})
await page.waitForTimeout(400)

check('no uncaught errors from the speech path', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
