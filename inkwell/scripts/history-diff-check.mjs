/**
 * Scene history diff + restore, proven live.
 *
 * The feature already existed (word-level diff in diff.ts + the snapshot
 * diff dialog + restore) but had no end-to-end coverage. Snapshots are the
 * writer's safety net, and restore overwrites the live scene, so the loop
 * earns a real proof: seed a scene with an older snapshot, open the History
 * list, compare (the diff must show what was added and removed), restore,
 * and confirm the manuscript on disk is the older text again.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/history-diff-check.mjs
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

const OLD_TEXT = 'The harbour was quiet under a grey sky.'
const NEW_TEXT = 'The harbour was loud under a golden sky at dawn.'

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(900)
const projectId = await page.evaluate(async ({ oldText, newText }) => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'History Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const cid = id('ch')
  await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: 'Chapter 1', order: 0, status: 'draft' })
  const sid = id('sc')
  // The live scene holds the NEW text; a snapshot holds the OLDER text.
  await put('scenes', { id: sid, createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: 'Scene 1', order: 0, content: doc(newText), plainText: newText, wordCount: newText.split(/\s+/).length, status: 'draft', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
  await put('snapshots', { id: id('snap'), createdAt: now - 60000, updatedAt: now - 60000, sceneId: sid, content: doc(oldText), plainText: oldText, wordCount: oldText.split(/\s+/).length, label: 'Earlier draft' })
  db.close()
  return pid
}, { oldText: OLD_TEXT, newText: NEW_TEXT })

await page.goto(`${BASE}#/editor?project=${projectId}`)
await eventually(async () => (await page.locator('.editor-prose').count()) > 0)
await page.waitForTimeout(1000)

// The Scene details panel (with History) is open by default at desktop
// width — no toggle needed; clicking the toggle would only close it.
// The drawer lists a snapshot by relative time + word count, each with a
// Compare button — that button's presence is the honest signal.
const historyUp = await eventually(async () => (await page.getByRole('button', { name: 'Compare' }).count()) > 0)
check('the snapshot appears in the History list', true, historyUp)

await page.getByRole('button', { name: 'Compare' }).first().click()
await page.waitForTimeout(500)
// The diff must show what changed: "loud"/"golden"/"dawn" removed (present
// now, absent in the snapshot) and "quiet"/"grey" added (in the snapshot).
const addedText = await page.locator('.diff-added, [data-diff="added"], ins').allInnerTexts().catch(() => [])
const removedText = await page.locator('.diff-removed, [data-diff="removed"], del').allInnerTexts().catch(() => [])
const diffBlob = (addedText.join(' ') + ' ' + removedText.join(' ')).toLowerCase()
check(
  'comparing shows the words that differ',
  true,
  diffBlob.includes('quiet') && diffBlob.includes('loud'),
  diffBlob.trim().slice(0, 80),
)

await page.getByRole('button', { name: /Restore this version/i }).click()
await page.waitForTimeout(2500)
const restored = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const scenes = await new Promise((res) => {
    const out = []
    const cur = db.transaction('scenes', 'readonly').objectStore('scenes').openCursor()
    cur.onsuccess = (e) => { const c = e.target.result; if (c) { out.push(c.value); c.continue() } else res(out) }
  })
  db.close()
  return scenes[0].plainText
})
check('restoring brings the older text back to the live scene', OLD_TEXT, restored)
check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
