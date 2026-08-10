/**
 * Cover on the spread, proven live against the emulators: a signed-in
 * writer with a Cover Studio cover publishes a share; the share document
 * carries the art as a size-capped JPEG data URL; an anonymous visitor
 * opens the link and the book opens on the actual cover — while a book
 * with no cover still publishes cleanly and opens on the plain title page.
 *
 *   npx firebase emulators:start --only auth,firestore --project demo-inkwell
 *   INKWELL_BASE_PATH=/ VITE_USE_FIREBASE_EMULATOR=true VITE_FIREBASE_API_KEY= \
 *     npx vite build --outDir dist-sync
 *   (cd dist-sync && python3 -m http.server 5411 --bind 127.0.0.1 &)
 *   node scripts/share-cover-check.mjs
 */
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? '/opt/node22/lib/node_modules/playwright/index.mjs'
)
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5411/'

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

// An 8×8 solid PNG so the "art" is a real image with real pixels.
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR42mP8z8Dwn4EIwDiqkL4KAVBGCBH1sJ0RAAAAAElFTkSuQmCC'

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const writer = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const W = await writer.newPage()
const errors = []
W.on('pageerror', (e) => errors.push(`writer: ${e}`))

// ── The writer signs up (per-account libraries switch on sign-up). ────────
await W.goto(`${BASE}#/settings`)
await W.getByRole('tab', { name: 'Account' }).click()
await W.waitForTimeout(400)
await W.getByRole('button', { name: 'Sign in' }).click()
await W.getByRole('button', { name: "Don't have an account? Create one" }).click()
await W.locator('#auth-author-name').fill('Cover Writer')
await W.locator('#auth-email').fill(`cover-${Date.now()}@example.test`)
await W.locator('#auth-password').fill('spread-the-jacket')
await W.getByRole('button', { name: 'Create account' }).click()
await eventually(async () => {
  const key = await W.evaluate(() => localStorage.getItem('inkwell-active-library')).catch(() => null)
  return key && key !== 'guest'
})
await W.waitForTimeout(800)

// ── Seed two books INTO THE ACCOUNT'S library: one with a cover, one bare. ─
await W.goto(`${BASE}#/projects`)
await W.waitForTimeout(600)
const ids = await W.evaluate(async (pngB64) => {
  const key = localStorage.getItem('inkwell-active-library')
  const dbName = key && key !== 'guest' ? `inkwell-u-${key}` : 'inkwell'
  const open = indexedDB.open(dbName)
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
  const mkBook = async (title) => {
    const pid = id('p')
    await put('projects', { id: pid, createdAt: now, updatedAt: now, title, author: 'Cover Writer', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
    const cid = id('ch')
    await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: 'Chapter 1', order: 0, status: 'drafting' })
    const text = 'The lighthouse kept its own ledger of storms.'
    await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: 'Scene 1', order: 0, content: doc(text), plainText: text, wordCount: 8, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
    return pid
  }
  const jacketed = await mkBook('The Jacketed Book')
  const bare = await mkBook('The Bare Book')
  // The jacketed book's cover: an image asset plus an active cover design.
  const bytes = Uint8Array.from(atob(pngB64), (c) => c.charCodeAt(0))
  const imgId = id('img')
  await put('imageAssets', { id: imgId, createdAt: now, updatedAt: now, blob: new Blob([bytes], { type: 'image/png' }), mimeType: 'image/png', width: 8, height: 8, fileName: 'art.png' })
  await put('covers', { id: id('cov'), createdAt: now, updatedAt: now, projectId: jacketed, name: 'Cover 1', active: true, sourceImageId: imgId, aspectPreset: 'ebook', crop: { x: 50, y: 50, zoom: 1, rotation: 0 }, overlay: { enabled: false, color: '#000000', opacity: 0.35, direction: 'bottom' }, typography: [], exportedImageId: null })
  db.close()
  return { jacketed, bare }
}, PNG_B64)
await W.reload()
await W.waitForTimeout(900)

// ── Publish the jacketed book; the share doc must carry the cover. ────────
async function publish(projectId) {
  await W.goto(`${BASE}#/read?project=${projectId}`)
  await W.waitForTimeout(1200)
  // The account-switch reload can race the first navigation after sign-up;
  // one hard reload settles the app on the right library and route.
  let shareUp = await eventually(async () => (await W.getByRole('button', { name: 'Share' }).count()) > 0, 10000)
  if (!shareUp) {
    await W.reload()
    await W.waitForTimeout(1500)
    shareUp = await eventually(async () => (await W.getByRole('button', { name: 'Share' }).count()) > 0, 15000)
  }
  if (!shareUp) {
    const state = (await W.locator('body').innerText()).slice(0, 300).replace(/\n+/g, ' | ')
    throw new Error(`Share button never appeared. Page shows: ${state}`)
  }
  await W.getByRole('button', { name: 'Share' }).click()
  await W.getByRole('button', { name: 'Publish read-only copy' }).click()
  await eventually(async () => (await W.getByRole('textbox', { name: 'The share link' }).count()) > 0)
  const link = await W.getByRole('textbox', { name: 'The share link' }).inputValue()
  await W.keyboard.press('Escape')
  return link.split('/shared/')[1]
}

const jacketedShare = await publish(ids.jacketed)
check('the jacketed book publishes', true, typeof jacketedShare === 'string' && jacketedShare.length > 5)

const shareDoc = await (
  await fetch(
    `http://127.0.0.1:8080/v1/projects/demo-inkwell/databases/(default)/documents/shares/${jacketedShare}`,
    { headers: { Authorization: 'Bearer owner' } },
  )
).json()
const coverField = shareDoc.fields?.cover?.stringValue ?? ''
check('the share document carries the cover as a jpeg data URL', true, coverField.startsWith('data:image/jpeg;base64,'))
check('…comfortably inside the document budget', true, coverField.length > 100 && coverField.length <= 700000, `${coverField.length} chars`)

const bareShare = await publish(ids.bare)
const bareDoc = await (
  await fetch(
    `http://127.0.0.1:8080/v1/projects/demo-inkwell/databases/(default)/documents/shares/${bareShare}`,
    { headers: { Authorization: 'Bearer owner' } },
  )
).json()
check('a book with no cover publishes with no cover field at all', undefined, bareDoc.fields?.cover)

// ── An anonymous visitor opens both links. ─────────────────────────────────
const visitor = await browser.newContext({ viewport: { width: 1200, height: 900 } })
const R = await visitor.newPage()
R.on('pageerror', (e) => errors.push(`reader: ${e}`))

await R.goto(`${BASE}#/shared/${jacketedShare}`)
const coverShown = await eventually(async () => {
  const img = R.locator('img.book-front-art').first()
  if ((await img.count()) === 0) return false
  const src = await img.getAttribute('src')
  return typeof src === 'string' && src.startsWith('data:image/jpeg;base64,')
})
check('the shared book opens on the actual cover art', true, coverShown)

await R.goto(`${BASE}#/shared/${bareShare}`)
await R.reload()
const titlePage = await eventually(async () => (await R.getByRole('heading', { name: 'The Bare Book' }).count()) > 0)
check('the bare book still opens on its plain title page', true, titlePage)
check('…with no cover image pretending otherwise', 0, await R.locator('img.book-front-art').count())

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
