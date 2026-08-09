/**
 * Beta-reader sharing, proven end to end against the emulator — a writer
 * publishes, a stranger with the link reads, and everyone without it is
 * turned away by the Firestore rules themselves (the emulator enforces
 * `firestore.rules`, so the deny checks here exercise the real policy).
 *
 * The plot: a writer signs up, writes a book, publishes a share, and hands
 * the link to a beta reader (a fresh browser context with no account and no
 * Firebase SDK bytes needed). The reader reads. The writer revises and
 * updates — same link, new prose. Then the writer revokes, and the link
 * dies everywhere at once. Around that, the rules are probed directly:
 * nobody can LIST the shares collection, and nobody but the owner can write.
 *
 *   npx firebase emulators:start --only auth,firestore --project demo-inkwell
 *   INKWELL_BASE_PATH=/ VITE_USE_FIREBASE_EMULATOR=true VITE_FIREBASE_API_KEY= \
 *     npx vite build --outDir dist-sync
 *   (cd dist-sync && python3 -m http.server 5411 --bind 127.0.0.1 &)
 *   node scripts/share-check.mjs
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

async function eventually(probe, { timeout = 20000, interval = 400 } = {}) {
  const deadline = Date.now() + timeout
  for (;;) {
    const value = await probe()
    if (value) return value
    if (Date.now() > deadline) return false
    await new Promise((r) => setTimeout(r, interval))
  }
}

const email = `author-${Date.now()}@example.test`
const password = 'quiet-margins-eleven'

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })

async function newDevice(name) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`))
  return { ctx, page, errors }
}

// ── The writer: account, book, prose ────────────────────────────────────────
const W = await newDevice('writer')
await W.page.goto(`${BASE}#/settings`)
await W.page.getByRole('tab', { name: 'Account' }).click()
await W.page.getByRole('button', { name: 'Sign in' }).click()
await W.page.getByRole('button', { name: "Don't have an account? Create one" }).click()
await W.page.locator('#auth-author-name').fill('Vivian Marsh')
await W.page.locator('#auth-email').fill(email)
await W.page.locator('#auth-password').fill(password)
await W.page.getByRole('button', { name: 'Create account' }).click()
const signedUp = await eventually(async () => (await W.page.getByText(email).count()) > 0)
check('the writer creates an account', true, signedUp)

await W.page.goto(`${BASE}#/projects`)
await W.page.waitForTimeout(800)
await W.page.getByRole('button', { name: 'New project' }).click()
await W.page.getByLabel('Title').fill('The Lighthouse Accord')
await W.page.getByLabel(/Author/).fill('Vivian Marsh')
await W.page.getByRole('button', { name: /^Create/ }).click()
await W.page.waitForTimeout(600)
await W.page.getByText('The Lighthouse Accord').click()
await W.page.waitForTimeout(1000)

const projectId = await eventually(async () => {
  const hash = new URL(W.page.url()).hash
  const match = /project=([a-z0-9-]+)/i.exec(hash)
  return match ? match[1] : false
})
check('…and opens it in the editor', true, Boolean(projectId), `project=${projectId}`)

await W.page.getByRole('button', { name: /Chapter/ }).first().click()
await W.page.waitForTimeout(800)
await eventually(async () => (await W.page.locator('.editor-prose').count()) > 0)
await W.page.locator('.editor-prose').click()
await W.page.keyboard.type(
  'The lighthouse kept its own ledger of storms, and Marta had learned to read it.',
)
await W.page.waitForTimeout(2500) // autosave

// ── Publish ──────────────────────────────────────────────────────────────────
await W.page.goto(`${BASE}#/read?project=${projectId}`)
await W.page.waitForTimeout(1200)
const shareButton = await eventually(
  async () => (await W.page.getByRole('button', { name: 'Share' }).count()) > 0,
)
check('the Read screen offers Share to a signed-in writer', true, shareButton)

await W.page.getByRole('button', { name: 'Share' }).click()
await W.page.getByRole('button', { name: 'Publish read-only copy' }).click()
const linkShown = await eventually(
  async () => (await W.page.getByRole('textbox', { name: 'The share link' }).count()) > 0,
)
check('publishing produces a share link', true, linkShown)

const link = await W.page.getByRole('textbox', { name: 'The share link' }).inputValue()
const shareId = (/#\/shared\/([a-z0-9]+)/.exec(link) ?? [])[1] ?? ''
check(
  'the link is an unguessable 22-char id, not a project id',
  true,
  shareId.length === 22 && shareId !== projectId,
  shareId,
)

// ── The beta reader: no account, just the link ───────────────────────────────
const R = await newDevice('reader')
await R.page.goto(`${BASE}#/shared/${shareId}`)
const titleUp = await eventually(
  async () => (await R.page.getByRole('heading', { name: 'The Lighthouse Accord' }).count()) > 0,
)
check('the link opens the book for a stranger with no account', true, titleUp)
check(
  'the page says who it came from',
  true,
  (await R.page.getByText('Shared from INKWELL').count()) > 0,
)

// Page past the cover and find the prose itself.
await eventually(async () => (await R.page.getByRole('button', { name: 'Next page' }).count()) > 0)
await R.page.getByRole('button', { name: 'Next page' }).click()
const proseUp = await eventually(
  async () => (await R.page.getByText('kept its own ledger of storms').count()) > 0,
)
check('the prose is on the page, through the real page-flip reader', true, proseUp)

const sdkRequests = []
R.page.on('request', (req) => {
  if (/firestore\.googleapis|firebasejs|identitytoolkit/.test(req.url())) sdkRequests.push(req.url())
})

// ── Update: same link, new words ─────────────────────────────────────────────
await W.page.goto(`${BASE}#/editor?project=${projectId}`)
await eventually(async () => (await W.page.locator('.editor-prose').count()) > 0)
await W.page.locator('.editor-prose').click()
await W.page.keyboard.press('End')
await W.page.keyboard.type(' By June the ledger had a page for her too.')
await W.page.waitForTimeout(2500)

await W.page.goto(`${BASE}#/read?project=${projectId}`)
await W.page.waitForTimeout(1200)
await W.page.getByRole('button', { name: 'Share' }).click()
await eventually(async () => (await W.page.getByRole('textbox', { name: 'The share link' }).count()) > 0)
const linkBefore = await W.page.getByRole('textbox', { name: 'The share link' }).inputValue()
await W.page.getByRole('button', { name: 'Update the copy' }).click()
await eventually(async () => (await W.page.getByText('Shared copy updated').count()) > 0)
const linkAfter = await W.page.getByRole('textbox', { name: 'The share link' }).inputValue()
check('updating keeps the exact same link', linkBefore, linkAfter)
await W.page.keyboard.press('Escape')

await R.page.reload()
await eventually(async () => (await R.page.getByRole('button', { name: 'Next page' }).count()) > 0)
await R.page.getByRole('button', { name: 'Next page' }).click()
const revisionUp = await eventually(
  async () => (await R.page.getByText('a page for her too').count()) > 0,
)
check('the beta reader sees the revision at the old link', true, revisionUp)

// ── The rules: everyone without the link stays out ───────────────────────────
// These hit the emulator's REST endpoint with no auth at all — exactly what
// any stranger on the internet could send at the production database.
const listRes = await fetch(`${FS}/shares`)
check(
  'nobody can LIST the shares collection (rules deny enumeration)',
  403,
  listRes.status,
  'the unguessable id stays the only door',
)

const anonWrite = await fetch(`${FS}/shares/${shareId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { title: { stringValue: 'Defaced' } } }),
})
check('an anonymous write to a share is denied', 403, anonWrite.status)

// A different signed-in user is still not the owner.
const strangerRes = await fetch(
  'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=any',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `stranger-${Date.now()}@example.test`,
      password: 'not-the-owner-1',
      returnSecureToken: true,
    }),
  },
)
const strangerToken = (await strangerRes.json()).idToken
const foreignWrite = await fetch(`${FS}/shares/${shareId}`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${strangerToken}`,
  },
  body: JSON.stringify({
    fields: { ownerUid: { stringValue: 'hijacker' }, title: { stringValue: 'Mine now' } },
  }),
})
check('a different signed-in account cannot touch the share either', 403, foreignWrite.status)

// ── Reader notes: a suggestion box, not a forum ─────────────────────────────
await R.page.getByRole('button', { name: 'Leave a note' }).click()
await R.page.getByLabel('Your note').fill('The lighthouse ledger gave me chills. More Marta, please.')
await R.page.getByLabel(/Your name/).fill('Beta Bee')
await R.page.getByRole('button', { name: 'Send note' }).click()
const noteSent = await eventually(
  async () => (await R.page.getByText('Note sent to the author').count()) > 0,
)
check('a beta reader leaves a note through the real dialog', true, noteSent)

// The rules around the box, probed raw: strangers can drop notes in but
// never read, list, or slip in a malformed parcel.
const anonNoteList = await fetch(`${FS}/shares/${shareId}/comments`)
check('nobody can LIST the notes anonymously', 403, anonNoteList.status)

const oversize = await fetch(`${FS}/shares/${shareId}/comments`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fields: {
      chapterIndex: { integerValue: '0' },
      quote: { stringValue: '' },
      note: { stringValue: 'x'.repeat(2500) },
      name: { stringValue: '' },
      createdAt: { integerValue: String(Date.now()) },
    },
  }),
})
check('an over-size note is refused at the door', 403, oversize.status)

const wrongShape = await fetch(`${FS}/shares/${shareId}/comments`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fields: {
      note: { stringValue: 'sneaky' },
      chapterIndex: { integerValue: '0' },
      quote: { stringValue: '' },
      name: { stringValue: '' },
      createdAt: { integerValue: String(Date.now()) },
      admin: { booleanValue: true },
    },
  }),
})
check('a parcel with extra fields is refused', 403, wrongShape.status)

// The writer finds the note waiting in the Share dialog, and can bin it.
// Make sure the dialog is fully closed first, so reopening is a real
// open→fetch cycle rather than a no-op on an already-open dialog.
await W.page.keyboard.press('Escape')
await eventually(async () => (await W.page.getByRole('dialog').count()) === 0)
await W.page.getByRole('button', { name: 'Share' }).click()
const noteArrived = await eventually(
  async () => (await W.page.getByText('More Marta, please.').count()) > 0,
)
check('the writer finds the note in the Share dialog', true, noteArrived)
check('…signed by its reader', true, (await W.page.getByText('Beta Bee').count()) > 0)

await W.page.getByRole('button', { name: 'Delete this note' }).first().click()
const noteGone = await eventually(
  async () => (await W.page.getByText('More Marta, please.').count()) === 0,
)
check('…and can delete it', true, noteGone)

// Leave one more note in the box so revoke has something to sweep.
await R.page.getByRole('button', { name: 'Leave a note' }).click()
await R.page.getByLabel('Your note').fill('A second note, destined for the sweep.')
await R.page.getByRole('button', { name: 'Send note' }).click()
await eventually(async () => (await R.page.getByText('Note sent to the author').count()) > 0)

// ── The pulse: the book was opened, and when — never who ────────────────────
// The reader's visit above should already have pinged. The writer sees it.
await W.page.keyboard.press('Escape')
await eventually(async () => (await W.page.getByRole('dialog').count()) === 0)
await W.page.getByRole('button', { name: 'Share' }).click()
const pulseShown = await eventually(async () => (await W.page.getByText(/Opened \d+ time/).count()) > 0)
check('the writer sees the share has been opened', true, pulseShown)

const anonPulseList = await fetch(`${FS}/shares/${shareId}/pulse`)
check('nobody can LIST the pulse anonymously', 403, anonPulseList.status)
const badPulse = await fetch(`${FS}/shares/${shareId}/pulse`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { at: { integerValue: '1' }, who: { stringValue: 'spy' } } }),
})
check('a pulse ping carrying anything but a timestamp is refused', 403, badPulse.status)
await W.page.keyboard.press('Escape')

// ── Bookmarks: the reader resumes where they left off ───────────────────────
// Move a page or two into the book if we aren't already, then reload and
// confirm it reopens there rather than back at the cover.
for (let i = 0; i < 2; i++) {
  const next = R.page.getByRole('button', { name: 'Next page' })
  if (await next.isEnabled().catch(() => false)) {
    await next.click()
    await R.page.waitForTimeout(1400)
  }
}
const marked = (await R.page.locator('footer').innerText()).replace(/\s+/g, ' ')
const markedPage = Number(/page (\d+)/.exec(marked)?.[1] ?? 0)
await R.page.reload()
await eventually(async () => (await R.page.locator('footer').innerText().catch(() => '')).includes('page'))
await R.page.waitForTimeout(1600)
const afterReload = (await R.page.locator('footer').innerText()).replace(/\s+/g, ' ')
const reopenedPage = Number(/page (\d+)/.exec(afterReload)?.[1] ?? 0)
check(
  'a shared book reopens where the reader left off',
  true,
  markedPage > 1 && reopenedPage === markedPage,
  `left at page ${markedPage} → reopened at page ${reopenedPage}`,
)

const mistyped = await newDevice('mistyped')
await mistyped.page.goto(`${BASE}#/shared/zzzzzzzzzzzzzzzzzzzzzz`)
const politeNo = await eventually(
  async () => (await mistyped.page.getByText('This book is no longer shared').count()) > 0,
)
check('a mistyped link gets a plain answer, not a spinner', true, politeNo)

// ── Revoke: the link dies everywhere ─────────────────────────────────────────
// The writer's dialog was closed during the pulse check; reopen it to revoke.
if ((await W.page.getByRole('button', { name: 'Stop sharing' }).count()) === 0) {
  await W.page.getByRole('button', { name: 'Share' }).click()
  await eventually(async () => (await W.page.getByRole('button', { name: 'Stop sharing' }).count()) > 0)
}
await W.page.getByRole('button', { name: 'Stop sharing' }).click()
await eventually(async () => (await W.page.getByText('the link no longer works').count()) > 0)

await R.page.reload()
const goneUp = await eventually(
  async () => (await R.page.getByText('This book is no longer shared').count()) > 0,
)
check('after revoke the beta reader is told the book is gone', true, goneUp)

const metaGone = await fetch(`${FS}/shares/${shareId}`)
const chaptersLeft = await (await fetch(`${FS}/shares/${shareId}/chapters`)).json()
check('the share meta document is deleted', 404, metaGone.status)
check(
  'no orphaned chapter documents survive the revoke',
  0,
  (chaptersLeft.documents ?? []).length,
)
// Notes can't be listed anonymously even post-mortem, so the sweep is
// verified with the emulator's owner bypass — the same all-seeing eye the
// sync harness uses.
const notesLeft = await (
  await fetch(`${FS}/shares/${shareId}/comments`, {
    headers: { Authorization: 'Bearer owner' },
  })
).json()
check('reader notes are swept with the revoke', 0, (notesLeft.documents ?? []).length)
const pulseLeft = await (
  await fetch(`${FS}/shares/${shareId}/pulse`, { headers: { Authorization: 'Bearer owner' } })
).json()
check('the pulse is swept with the revoke too', 0, (pulseLeft.documents ?? []).length)

check(
  'the beta reader never talked to the Firebase SDK endpoints',
  [],
  sdkRequests,
  'shares are read over plain REST fetch',
)
check('no uncaught errors anywhere', [], [...W.errors, ...R.errors, ...mistyped.errors])

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
