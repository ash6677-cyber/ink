/**
 * Per-account libraries, proven live against the real auth + Firestore
 * emulators, on one shared "computer" (one browser profile):
 *
 *   · a guest writes a book, signs up, and lands in an EMPTY account
 *     library — with a one-time offer to bring the guest book in (copy,
 *     not move);
 *   · a second person signs up on the same machine and sees nothing of
 *     anyone else's — not the guest book they declined, not user A's
 *     account books, locally or in their slice of the cloud;
 *   · signing out returns to the guest library exactly as it was;
 *   · signing back in as A restores A's own books;
 *   · each identity has its own IndexedDB database on disk.
 *
 *   npx firebase emulators:start --only auth,firestore --project demo-inkwell
 *   INKWELL_BASE_PATH=/ VITE_USE_FIREBASE_EMULATOR=true VITE_FIREBASE_API_KEY= \
 *     npx vite build --outDir dist-sync
 *   (cd dist-sync && python3 -m http.server 5411 --bind 127.0.0.1 &)
 *   node scripts/library-isolation-check.mjs
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
const eventually = async (p, t = 20000) => {
  const d = Date.now() + t
  for (;;) {
    const v = await p()
    if (v) return v
    if (Date.now() > d) return false
    await new Promise((r) => setTimeout(r, 400))
  }
}

const stamp = Date.now()
const emailA = `alice-${stamp}@example.test`
const emailB = `bruno-${stamp}@example.test`
const password = 'two-writers-one-desk'

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
// ONE context: this whole check is about one shared computer.
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

const activeLibrary = () => page.evaluate(() => localStorage.getItem('inkwell-active-library'))

async function signUp(email, name) {
  await page.goto(`${BASE}#/settings`)
  await page.getByRole('tab', { name: 'Account' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: "Don't have an account? Create one" }).click()
  await page.locator('#auth-author-name').fill(name)
  await page.locator('#auth-email').fill(email)
  await page.locator('#auth-password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  // The auth bridge switches libraries and reloads; wait for both.
  await eventually(async () => {
    const key = await activeLibrary().catch(() => null)
    return key && key !== 'guest'
  })
  await page.waitForTimeout(800)
}

async function signIn(email) {
  await page.goto(`${BASE}#/settings`)
  await page.getByRole('tab', { name: 'Account' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.locator('#auth-email').fill(email)
  await page.locator('#auth-password').fill(password)
  await page.getByRole('button', { name: /^Sign in$/ }).click()
  await eventually(async () => {
    const key = await activeLibrary().catch(() => null)
    return key && key !== 'guest'
  })
  await page.waitForTimeout(800)
}

async function signOut() {
  await page.goto(`${BASE}#/settings`)
  await page.getByRole('tab', { name: 'Account' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await eventually(async () => (await activeLibrary().catch(() => null)) === 'guest')
  await page.waitForTimeout(800)
}

async function newProject(title) {
  await page.goto(`${BASE}#/projects`)
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'New project' }).first().click()
  await page.getByLabel('Title').fill(title)
  await page.getByRole('button', { name: /^Create/ }).click()
  await page.waitForTimeout(600)
}

// ── A guest writes a book before ever signing in ─────────────────────────
await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(900)
await newProject('Guest Draft')
check('the guest writes a book', true, (await page.getByText('Guest Draft').count()) > 0)
check('the guest library is the original database', 'guest', (await activeLibrary()) ?? 'guest')

// ── Alice signs up on this machine ────────────────────────────────────────
await signUp(emailA, 'Alice')
const uidA = await activeLibrary()
check('signing up switches to Alice’s own library', true, !!uidA && uidA !== 'guest', `uid=${uidA}`)

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(900)
check(
  'Alice’s fresh library does NOT contain the guest book',
  0,
  await page.getByText('Guest Draft').count(),
)
const bannerUp = await eventually(async () => (await page.locator('[data-claim-banner]').count()) > 0)
check('…but the one-time offer to bring it in appears', true, bannerUp)

await page.getByRole('button', { name: /Bring it in/ }).click()
const claimed = await eventually(async () => (await page.getByText('Guest Draft').count()) > 0)
check('claiming copies the guest book into Alice’s library', true, claimed)

// It must also reach Alice's slice of the cloud, and only Alice's.
const cloudDocs = async (uid) => {
  const res = await fetch(
    `http://127.0.0.1:8080/v1/projects/demo-inkwell/databases/(default)/documents/users/${uid}/projects?pageSize=50`,
    { headers: { Authorization: 'Bearer owner' } },
  )
  return res.text()
}
const inAliceCloud = await eventually(async () => (await cloudDocs(uidA)).includes('Guest Draft'), 30000)
check('the claimed book syncs up into Alice’s account', true, inAliceCloud)

await newProject('Salt Ledger')
check('Alice writes a second book', true, (await page.getByText('Salt Ledger').count()) > 0)

// ── Alice signs out: the machine goes back to the guest shelf ────────────
await signOut()
await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(900)
check('signed out again, the guest book is still on the guest shelf', true, (await page.getByText('Guest Draft').count()) > 0)
check('…and Alice’s account book is nowhere in sight', 0, await page.getByText('Salt Ledger').count())

// ── Bruno signs up on the same machine ────────────────────────────────────
await signUp(emailB, 'Bruno')
const uidB = await activeLibrary()
check('Bruno gets his own library key', true, !!uidB && uidB !== 'guest' && uidB !== uidA, `uid=${uidB}`)

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(900)
check('Bruno’s fresh library holds none of Alice’s books', 0, await page.getByText('Salt Ledger').count())
check('…and not the guest book either', 0, await page.getByText('Guest Draft').count())

// Bruno declines the guest offer; his library must stay empty.
const brunoBanner = await eventually(async () => (await page.locator('[data-claim-banner]').count()) > 0)
check('Bruno is offered the machine’s guest books (offer, never automatic)', true, brunoBanner)
await page.getByRole('button', { name: 'Not now' }).click()
await page.waitForTimeout(400)
check('declining leaves Bruno’s library empty', 0, await page.getByText('Guest Draft').count())

const brunoCloud = await cloudDocs(uidB)
check('Bruno’s cloud slice holds neither book', true, !brunoCloud.includes('Guest Draft') && !brunoCloud.includes('Salt Ledger'))

// ── Alice returns: her books come back, all of them, only hers ───────────
await signOut()
await signIn(emailA)
await page.goto(`${BASE}#/projects`)
const aliceBack = await eventually(async () =>
  (await page.getByText('Salt Ledger').count()) > 0 && (await page.getByText('Guest Draft').count()) > 0,
)
check('Alice signs back in and finds exactly her own books', true, aliceBack)

// ── The proof on disk: one database per identity ──────────────────────────
const dbNames = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))
check('the guest database exists under its original name', true, dbNames.includes('inkwell'))
check('Alice has her own database', true, dbNames.includes(`inkwell-u-${uidA}`))
check('Bruno has his own database', true, dbNames.includes(`inkwell-u-${uidB}`))

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
