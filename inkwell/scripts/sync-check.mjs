/**
 * Cross-device sync, proven end to end — two browsers, one account, no
 * real credentials anywhere.
 *
 * The whole cloud layer runs against the Firebase Emulator Suite (`npm run
 * firebase:emulators`), exactly as it was built to. Device A signs up
 * through the real dialog, writes a book; device B signs in and must find
 * it. Then the harder promises: edits flowing back the other way while both
 * are open, edits made offline arriving after reconnect, and signing out
 * leaving the local library exactly where it was.
 *
 *   npx firebase emulators:start --only auth,firestore --project demo-inkwell
 *   INKWELL_BASE_PATH=/ VITE_USE_FIREBASE_EMULATOR=true VITE_FIREBASE_API_KEY= \
 *     npx vite build --outDir dist-sync
 *   (VITE_FIREBASE_API_KEY is *blanked deliberately*: the committed
 *   .env.production would otherwise put the real project id into this build,
 *   and the emulator writes would land under it instead of demo-inkwell —
 *   the harness's direct Firestore probes query demo-inkwell.)
 *   (cd dist-sync && python3 -m http.server 5411 --bind 127.0.0.1 &)
 *   node scripts/sync-check.mjs
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

/** Polls until `probe` returns truthy or patience runs out. Sync is eventually
 * consistent by design, so every cross-device assertion gets this treatment. */
async function eventually(probe, { timeout = 20000, interval = 500 } = {}) {
  const deadline = Date.now() + timeout
  for (;;) {
    const value = await probe()
    if (value) return value
    if (Date.now() > deadline) return false
    await new Promise((r) => setTimeout(r, interval))
  }
}

const email = `writer-${Date.now()}@example.test`
const password = 'salt-road-longhand'

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })

async function newDevice(name) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`))
  return { ctx, page, errors }
}

async function openAccountTab(page) {
  await page.goto(`${BASE}#/settings`)
  await page.getByRole('tab', { name: 'Account' }).click()
  await page.waitForTimeout(400)
}

// ── Device A: a writer creates an account and a book ───────────────────────
const A = await newDevice('A')
await openAccountTab(A.page)
await A.page.getByRole('button', { name: 'Sign in' }).click()
await A.page.getByRole('button', { name: "Don't have an account? Create one" }).click()
await A.page.locator('#auth-author-name').fill('A. Writer')
await A.page.locator('#auth-email').fill(email)
await A.page.locator('#auth-password').fill(password)
await A.page.getByRole('button', { name: 'Create account' }).click()

const signedUpA = await eventually(async () =>
  (await A.page.getByText(email).count()) > 0 ? true : false,
)
check('device A creates an account through the real dialog', true, signedUpA)

await A.page.goto(`${BASE}#/projects`)
await A.page.waitForTimeout(800)
await A.page.getByRole('button', { name: 'New project' }).click()
await A.page.getByLabel('Title').fill('The Tide Ledger')
await A.page.getByRole('button', { name: /^Create/ }).click()
await A.page.waitForTimeout(500)
check('…and writes a book', true, (await A.page.getByText('The Tide Ledger').count()) > 0)

// The engine should push it to the (emulated) cloud without being asked.
const cloudHas = (COLLECTION, needle) =>
  eventually(async () => {
    const res = await fetch(
    'http://127.0.0.1:8080/v1/projects/demo-inkwell/databases/(default)/documents:runQuery',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: { from: [{ collectionId: COLLECTION, allDescendants: true }], limit: 300 },
      }),
    },
  )
    return (await res.text()).includes(needle)
  }, { timeout: 30000 })

const inCloud = await cloudHas('projects', 'The Tide Ledger')
check('the book reaches the cloud on its own', true, inCloud)

// ── Device B: same account, different machine ───────────────────────────────
const B = await newDevice('B')
await openAccountTab(B.page)
await B.page.getByRole('button', { name: 'Sign in' }).click()
await B.page.locator('#auth-email').fill(email)
await B.page.locator('#auth-password').fill(password)
await B.page.getByRole('button', { name: 'Sign in' }).last().click()
const signedInB = await eventually(async () =>
  (await B.page.getByText(email).count()) > 0 ? true : false,
)
check('device B signs in to the same account', true, signedInB)

await B.page.goto(`${BASE}#/projects`)
const arrived = await eventually(async () => {
  if ((await B.page.getByText('The Tide Ledger').count()) > 0) return true
  return false
}, { timeout: 30000 })
check('the book written on A is on B’s shelf', true, arrived)

// ── Both directions, both open ──────────────────────────────────────────────
// B renames the book; A must see the new name arrive live.
await B.page.getByRole('button', { name: 'More actions for The Tide Ledger', exact: true }).click()
await B.page.getByRole('menuitem', { name: 'Edit', exact: true }).click()
await B.page.getByLabel('Title').fill('The Tide Ledger, Revised')
await B.page.getByRole('button', { name: /^Save/ }).click()
await B.page.waitForTimeout(500)

await A.page.goto(`${BASE}#/projects`)
const renamed = await eventually(
  async () => (await A.page.getByText('The Tide Ledger, Revised').count()) > 0,
  { timeout: 30000 },
)
check('a rename on B arrives on A', true, renamed)

// ── Prose syncs too, not just shelves ───────────────────────────────────────
await A.page.getByText('The Tide Ledger, Revised').click()
await A.page.waitForTimeout(1000)
// A fresh project starts empty; add a chapter through the real tree.
await A.page.getByRole('button', { name: /Chapter/ }).first().click()
await A.page.waitForTimeout(800)
const editorReady = await eventually(async () => (await A.page.locator('.editor-prose').count()) > 0)
check('A opens the editor', true, editorReady)
await A.page.locator('.editor-prose').click()
await A.page.keyboard.type('The tide itemised everything, and sent the bill to Charlotte.')
// Autosave (800ms) then push.
await A.page.waitForTimeout(2500)

const prose = await cloudHas('scenes', 'sent the bill to Charlotte')
check('typed prose reaches the cloud', true, prose)

// ── Offline edits replay on reconnect ───────────────────────────────────────
await B.ctx.setOffline(true)
await B.page.getByRole('button', { name: 'More actions for The Tide Ledger, Revised', exact: true }).click()
await B.page.getByRole('menuitem', { name: 'Edit', exact: true }).click()
await B.page.getByLabel('Title').fill('The Tide Ledger, Offline Edition')
await B.page.getByRole('button', { name: /^Save/ }).click()
await B.page.waitForTimeout(800)
check(
  'B keeps working with the network gone',
  true,
  (await B.page.getByText('The Tide Ledger, Offline Edition').count()) > 0,
)
await B.ctx.setOffline(false)

await A.page.goto(`${BASE}#/projects`)
const offlineEditArrived = await eventually(
  async () => (await A.page.getByText('The Tide Ledger, Offline Edition').count()) > 0,
  { timeout: 30000 },
)
check('the offline edit arrives on A after reconnect', true, offlineEditArrived)

// ── Signing out never takes the books with it ───────────────────────────────
await openAccountTab(A.page)
await A.page.getByRole('button', { name: /Sign out/ }).click()
await A.page.waitForTimeout(1000)
await A.page.goto(`${BASE}#/projects`)
await A.page.waitForTimeout(1000)
check(
  'signing out leaves the local library alone',
  true,
  (await A.page.getByText('The Tide Ledger, Offline Edition').count()) > 0,
  'local-first means the cloud is a copy, never a hostage',
)

check('no uncaught errors on either device', [], [...A.errors, ...B.errors])

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
