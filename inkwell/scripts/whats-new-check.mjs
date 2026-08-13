/**
 * "What's new" for returning readers, proven live against the emulators:
 * a writer publishes; a reader visits and sees no banner (nothing is new
 * on a first visit); the writer re-publishes with a note; the returning
 * reader — recognised purely by their own device's memory — sees "Since
 * your last visit: …" exactly once, can dismiss it, and doesn't see it
 * again on the next visit; a brand-new visitor never sees it at all.
 *
 *   npx firebase emulators:start --only auth,firestore --project demo-inkwell
 *   INKWELL_BASE_PATH=/ VITE_USE_FIREBASE_EMULATOR=true VITE_FIREBASE_API_KEY= \
 *     npx vite build --outDir dist-sync
 *   (cd dist-sync && python3 -m http.server 5411 --bind 127.0.0.1 &)
 *   node scripts/whats-new-check.mjs
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

// ── Writer signs up and seeds a small book. ────────────────────────────────
await W.goto(`${BASE}#/settings`)
await W.getByRole('tab', { name: 'Account' }).click()
await W.waitForTimeout(400)
await W.getByRole('button', { name: 'Sign in' }).click()
await W.getByRole('button', { name: "Don't have an account? Create one" }).click()
await W.locator('#auth-author-name').fill('News Writer')
await W.locator('#auth-email').fill(`news-${Date.now()}@example.test`)
await W.locator('#auth-password').fill('what-changed-here')
await W.getByRole('button', { name: 'Create account' }).click()
await eventually(async () => {
  const key = await W.evaluate(() => localStorage.getItem('inkwell-active-library')).catch(() => null)
  return key && key !== 'guest'
})
await W.waitForTimeout(800)

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
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'The Revised Ending', author: 'News Writer', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const cid = id('ch')
  await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: 'Chapter 1', order: 0, status: 'drafting' })
  const text = 'The first draft of the ending, soon to be replaced.'
  await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: 'Scene 1', order: 0, content: doc(text), plainText: text, wordCount: 10, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
  db.close()
  return pid
})
await W.reload()
await W.waitForTimeout(900)

// ── First publish, no note. ────────────────────────────────────────────────
await W.goto(`${BASE}#/read?project=${pid}`)
await W.waitForTimeout(1200)
let up = await eventually(async () => (await W.getByRole('button', { name: 'Share' }).count()) > 0, 10000)
if (!up) {
  await W.reload()
  await W.waitForTimeout(1500)
  await eventually(async () => (await W.getByRole('button', { name: 'Share' }).count()) > 0, 15000)
}
await W.getByRole('button', { name: 'Share' }).click()
await W.getByRole('button', { name: 'Publish read-only copy' }).click()
await eventually(async () => (await W.getByRole('textbox', { name: 'The share link' }).count()) > 0)
const shareId = (await W.getByRole('textbox', { name: 'The share link' }).inputValue()).split('/shared/')[1]
check('the book publishes', true, typeof shareId === 'string' && shareId.length > 5)

const shareDoc = async () =>
  (await fetch(`${FS}/shares/${shareId}`, { headers: { Authorization: 'Bearer owner' } })).json()
check('a note-less publish carries no note field', undefined, (await shareDoc()).fields?.note)

// ── The reader's first visit: no banner, ever. ─────────────────────────────
const reader = await browser.newContext({ viewport: { width: 1200, height: 900 } })
const R = await reader.newPage()
R.on('pageerror', (e) => errors.push(`reader: ${e}`))
await R.goto(`${BASE}#/shared/${shareId}`)
await eventually(async () => (await R.getByRole('button', { name: 'Next page' }).count()) > 0)
check('a first visit shows no banner', 0, await R.locator('[data-whats-new]').count())

// ── The writer republishes WITH a note (dialog stayed open). ───────────────
await W.locator('#whats-new').fill('Chapter 9 rewritten — the ending is new.')
await W.getByRole('button', { name: 'Update the copy' }).click()
await eventually(async () => ((await shareDoc()).fields?.note?.stringValue ?? '') !== '')
check('the note rides the share document', 'Chapter 9 rewritten — the ending is new.',
  (await shareDoc()).fields?.note?.stringValue)

// ── The returning reader sees it once. ─────────────────────────────────────
await R.reload()
const bannerUp = await eventually(async () => (await R.locator('[data-whats-new]').count()) > 0)
check('the returning reader is told what changed', true, bannerUp)
check('…in the writer\'s words', true,
  /Since your last visit:.*Chapter 9 rewritten/.test((await R.locator('[data-whats-new]').innerText()).replace(/\n+/g, ' ')))

await R.getByRole('button', { name: "Dismiss what's new" }).click()
await eventually(async () => (await R.locator('[data-whats-new]').count()) === 0)
check('the banner dismisses', true, true)

// The visit already re-stamped last-seen, so the same note stays quiet now.
await R.reload()
await eventually(async () => (await R.getByRole('button', { name: 'Next page' }).count()) > 0)
await R.waitForTimeout(600)
check('the same note never nags on the next visit', 0, await R.locator('[data-whats-new]').count())

// ── A brand-new visitor has no "last visit" to be newer than. ──────────────
const fresh = await browser.newContext({ viewport: { width: 1200, height: 900 } })
const F = await fresh.newPage()
F.on('pageerror', (e) => errors.push(`fresh: ${e}`))
await F.goto(`${BASE}#/shared/${shareId}`)
await eventually(async () => (await F.getByRole('button', { name: 'Next page' }).count()) > 0)
await F.waitForTimeout(600)
check('a first-time visitor never sees the banner', 0, await F.locator('[data-whats-new]').count())

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
