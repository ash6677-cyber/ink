/**
 * Where readers stop, proven live against the emulators — rules included:
 * a writer publishes a three-chapter share; the security rules admit
 * exactly the two pulse shapes ({at} and {at, chapter}) and refuse
 * everything else; one anonymous reader turns pages to the very end and
 * another stops at chapter one; the pulse collection then holds one reach
 * ping per device per chapter (paging back and forth never double-counts);
 * and the writer's share dialog draws the honest drop-off — 2 opens,
 * bars 2·1·1, 1 finished.
 *
 *   npx firebase emulators:start --only auth,firestore --project demo-inkwell
 *   INKWELL_BASE_PATH=/ VITE_USE_FIREBASE_EMULATOR=true VITE_FIREBASE_API_KEY= \
 *     npx vite build --outDir dist-sync
 *   (cd dist-sync && python3 -m http.server 5411 --bind 127.0.0.1 &)
 *   node scripts/drop-off-check.mjs
 */
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? '/opt/node22/lib/node_modules/playwright/index.mjs'
)
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5411/'
const FS = 'http://127.0.0.1:8080/v1/projects/demo-inkwell/databases/(default)/documents'

let failures = 0
const check = (name, expected, actual, note = '') => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual)
  if (!ok) failures++
  console.log(
    `${ok ? 'PASS' : 'FAIL'} · ${name} → ${JSON.stringify(actual)}` +
      `${ok ? '' : ` — expected ${JSON.stringify(expected)}`}${note ? ` · ${note}` : ''}`,
  )
}
const eventually = async (p, t = 25000) => {
  const d = Date.now() + t
  for (;;) {
    const v = await p()
    if (v) return v
    if (Date.now() > d) return false
    await new Promise((r) => setTimeout(r, 400))
  }
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const writer = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const W = await writer.newPage()
const errors = []
W.on('pageerror', (e) => errors.push(`writer: ${e}`))
if (process.env.DEBUG_CONSOLE) {
  W.on('console', (m) => {
    const text = m.text()
    if (m.type() === 'error' || m.type() === 'warning' || /pulse|share-dialog/.test(text)) {
      console.log('W-CONSOLE:', m.type(), text.slice(0, 300))
    }
  })
}

// ── The writer signs up. ───────────────────────────────────────────────────
await W.goto(`${BASE}#/settings`)
await W.getByRole('tab', { name: 'Account' }).click()
await W.waitForTimeout(400)
await W.getByRole('button', { name: 'Sign in' }).click()
await W.getByRole('button', { name: "Don't have an account? Create one" }).click()
await W.locator('#auth-author-name').fill('Curve Writer')
await W.locator('#auth-email').fill(`curve-${Date.now()}@example.test`)
await W.locator('#auth-password').fill('where-they-stop')
await W.getByRole('button', { name: 'Create account' }).click()
await eventually(async () => {
  const key = await W.evaluate(() => localStorage.getItem('inkwell-active-library')).catch(() => null)
  return key && key !== 'guest'
})
await W.waitForTimeout(800)

// ── Seed a three-chapter book into the account's library. ─────────────────
await W.goto(`${BASE}#/projects`)
await W.waitForTimeout(600)
const pid = await W.evaluate(async () => {
  const key = localStorage.getItem('inkwell-active-library')
  const dbName = key && key !== 'guest' ? `inkwell-u-${key}` : 'inkwell'
  const open = indexedDB.open(dbName)
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'The Dropped Thread', author: 'Curve Writer', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  for (let c = 0; c < 3; c++) {
    const cid = id('ch')
    await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: `Chapter ${c + 1}`, order: c, status: 'drafting' })
    const text = `Chapter ${c + 1} keeps its own weather. `.repeat(6)
    await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: `Scene ${c + 1}`, order: 0, content: doc(text), plainText: text, wordCount: 42, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
  }
  db.close()
  return pid
})
await W.reload()
await W.waitForTimeout(900)

// ── Publish. ───────────────────────────────────────────────────────────────
await W.goto(`${BASE}#/read?project=${pid}`)
await W.waitForTimeout(1200)
let shareUp = await eventually(async () => (await W.getByRole('button', { name: 'Share' }).count()) > 0, 10000)
if (!shareUp) {
  await W.reload()
  await W.waitForTimeout(1500)
  await eventually(async () => (await W.getByRole('button', { name: 'Share' }).count()) > 0, 15000)
}
await W.getByRole('button', { name: 'Share' }).click()
await W.getByRole('button', { name: 'Publish read-only copy' }).click()
await eventually(async () => (await W.getByRole('textbox', { name: 'The share link' }).count()) > 0)
const link = await W.getByRole('textbox', { name: 'The share link' }).inputValue()
const shareId = link.split('/shared/')[1]
check('the book publishes', true, typeof shareId === 'string' && shareId.length > 5)
await W.keyboard.press('Escape')

// ── The rules admit exactly the two pulse shapes. ──────────────────────────
const post = async (fields) =>
  (
    await fetch(`${FS}/shares/${shareId}/pulse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
  ).status
const INT = (n) => ({ integerValue: String(n) })
check('rules accept an open ping {at}', 200, await post({ at: INT(Date.now()) }))
check('rules accept a reach ping {at, chapter}', 200, await post({ at: INT(Date.now()), chapter: INT(1) }))
check('rules refuse a non-integer chapter', 403, await post({ at: INT(Date.now()), chapter: { stringValue: 'x' } }))
check('rules refuse a negative chapter', 403, await post({ at: INT(Date.now()), chapter: INT(-1) }))
check('rules refuse any extra field', 403, await post({ at: INT(Date.now()), who: { stringValue: 'me' } }))

// Sweep the probe pings so the curve below counts only real readers.
const probeList = await (await fetch(`${FS}/shares/${shareId}/pulse`, { headers: { Authorization: 'Bearer owner' } })).json()
for (const d of probeList.documents ?? []) {
  await fetch(`http://127.0.0.1:8080/v1/${d.name}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } })
}

// ── Reader one: to the very end, then back, then forward again. ───────────
const readerOne = await browser.newContext({ viewport: { width: 1200, height: 900 } })
const R1 = await readerOne.newPage()
R1.on('pageerror', (e) => errors.push(`reader1: ${e}`))
await R1.goto(`${BASE}#/shared/${shareId}`)
await eventually(async () => (await R1.getByRole('button', { name: 'Next page' }).count()) > 0)
for (let i = 0; i < 30; i++) {
  const next = R1.getByRole('button', { name: 'Next page' })
  if (await next.isDisabled().catch(() => true)) break
  if (!(await next.click({ timeout: 3000 }).then(() => true).catch(() => false))) break
  await R1.waitForTimeout(350)
}
// Back to the front and forward again — the dedupe must hold.
for (let i = 0; i < 30; i++) {
  const prev = R1.getByRole('button', { name: 'Previous page' })
  if (await prev.isDisabled().catch(() => true)) break
  if (!(await prev.click({ timeout: 3000 }).then(() => true).catch(() => false))) break
  await R1.waitForTimeout(250)
}
for (let i = 0; i < 8; i++) {
  const next = R1.getByRole('button', { name: 'Next page' })
  if (await next.isDisabled().catch(() => true)) break
  if (!(await next.click({ timeout: 3000 }).then(() => true).catch(() => false))) break
  await R1.waitForTimeout(250)
}
await R1.waitForTimeout(800)

// ── Reader two: opens on the first spread (cover + chapter one), leaves. ──
const readerTwo = await browser.newContext({ viewport: { width: 1200, height: 900 } })
const R2 = await readerTwo.newPage()
R2.on('pageerror', (e) => errors.push(`reader2: ${e}`))
await R2.goto(`${BASE}#/shared/${shareId}`)
await eventually(async () => (await R2.getByRole('button', { name: 'Next page' }).count()) > 0)
await R2.waitForTimeout(800)

// ── The pulse now tells the honest story. ─────────────────────────────────
const pulseDocs = await eventually(async () => {
  const listing = await (
    await fetch(`${FS}/shares/${shareId}/pulse?pageSize=100`, { headers: { Authorization: 'Bearer owner' } })
  ).json()
  const docs = listing.documents ?? []
  const reach = docs.filter((d) => d.fields?.chapter !== undefined)
  return reach.length >= 4 ? docs : false
})
const chapterOf = (d) => (d.fields?.chapter ? Number(d.fields.chapter.integerValue) : null)
const opens = pulseDocs.filter((d) => chapterOf(d) === null).length
const perChapter = [0, 1, 2].map((c) => pulseDocs.filter((d) => chapterOf(d) === c).length)
check('two opens, one per visitor', 2, opens)
check('reach counts step down the honest curve (2·1·1)', [2, 1, 1], perChapter,
  'reader one everywhere once despite re-paging; reader two only at chapter 1')

// ── The writer's dialog draws it. ──────────────────────────────────────────
// A hash-only goto to the same URL is not a navigation — reload for real,
// so the dialog mounts fresh rather than showing its publish-time fetch.
await W.goto(`${BASE}#/read?project=${pid}`)
await W.reload()
await W.waitForTimeout(1500)
await eventually(async () => (await W.getByRole('button', { name: 'Share' }).count()) > 0)
await W.getByRole('button', { name: 'Share' }).click()
const curveUp = await eventually(async () => (await W.locator('[data-drop-off]').count()) > 0)
if (!curveUp) {
  console.log('DIALOG:', (await W.getByRole('dialog').innerText().catch(() => 'no dialog')).replace(/\n+/g, ' | '))
}
check('the dialog shows the drop-off bars', true, curveUp)
const curveText = (await W.locator('[data-drop-off]').innerText()).replace(/\s+/g, ' ')
check('every chapter has its bar and count', true,
  /Chapter 1 2/.test(curveText) && /Chapter 2 1/.test(curveText) && /Chapter 3 1/.test(curveText), curveText)
const dialogText = await W.getByRole('dialog').innerText()
check('the one-line story is told', true, /2 opens/.test(dialogText) && /1 finished/.test(dialogText))

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
