/**
 * Every major dialog, on a phone, with and without the keyboard.
 *
 * The bug this exists to keep dead: a dialog sized in `vh` (the *layout*
 * viewport) on iOS ends up taller than the *visible* screen, centres
 * itself, and puts its own top edge somewhere unreachable — worse once the
 * keyboard halves the visible region. The dialog primitive sizes and
 * positions from `--vvh`/`--vvtop` (fed by `visualViewport`); this harness
 * opens each dialog at iPhone size and asserts it sits fully inside the
 * visible region, then *emulates the keyboard* by shrinking the variables
 * the way the real listener does, and asserts the dialog followed.
 *
 *   INKWELL_BASE_PATH=/ npm run build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/mobile-dialog-check.mjs
 */
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? '/opt/node22/lib/node_modules/playwright/index.mjs'
)
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5410/'
const VIEW = { width: 390, height: 844 }
// The visible region a mid-size iPhone keyboard leaves behind.
const KEYBOARD = { vvh: 420, vvtop: 0 }

let failures = 0
const check = (name, expected, actual, note = '') => {
  const ok = JSON.stringify(expected) === JSON.stringify(actual)
  if (!ok) failures++
  console.log(
    `${ok ? 'PASS' : 'FAIL'} · ${name} → ${JSON.stringify(actual)}` +
      `${ok ? '' : ` — expected ${JSON.stringify(expected)}`}${note ? ` · ${note}` : ''}`,
  )
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: VIEW, hasTouch: true })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

await page.goto(`${BASE}#/projects`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)

const { projectId } = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((res, rej) => {
    open.onsuccess = () => res(open.result)
    open.onerror = () => rej(open.error)
  })
  const now = Date.now()
  const id = (p) => `${p}-${Math.random().toString(36).slice(2, 10)}`
  const put = (store, value) =>
    new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).put(value)
      tx.oncomplete = () => res(value)
      tx.onerror = () => rej(tx.error)
    })
  const projectId = id('p')
  await put('projects', {
    id: projectId, createdAt: now, updatedAt: now, title: 'The Tide Ledger', author: '',
    synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null,
    seriesOrder: 0, status: 'drafting',
    settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' },
  })
  const chapterId = id('c')
  await put('chapters', { id: chapterId, createdAt: now, updatedAt: now, projectId, title: 'Chapter 1', order: 0, status: 'drafting' })
  await put('scenes', {
    id: id('s'), createdAt: now, updatedAt: now, projectId, chapterId, title: 'Harbour Morning',
    order: 0, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The tide.' }] }] },
    plainText: 'The tide.', wordCount: 2, status: 'drafting', povCharacterId: null,
    locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [],
  })
  await put('characterCards', {
    id: id('card'), createdAt: now, updatedAt: now, projectId, codexEntryId: null,
    displayName: 'Maren Voss', avatarImageId: null, cropSettings: null,
    description: '', personality: '', scenario: '', firstMessage: '', exampleDialogue: [],
    systemPromptOverride: null, voiceNotes: '', tags: [],
  })
  db.close()
  return { projectId }
})

/**
 * The dialog must sit fully inside the visible region — first the whole
 * screen, then the keyboard-shrunk region emulated exactly the way
 * `trackViewport` writes it.
 */
async function auditOpenDialog(name) {
  const dialog = page.locator('[role="dialog"], [role="alertdialog"]').last()
  await dialog.waitFor({ timeout: 8000 })
  const box = await dialog.boundingBox()
  const fits = box && box.y >= 0 && box.y + box.height <= VIEW.height + 1
  check(`${name} · fits the phone screen`, true, Boolean(fits), box ? `top ${Math.round(box.y)}, bottom ${Math.round(box.y + box.height)}` : 'no box')

  await page.evaluate(({ vvh, vvtop }) => {
    document.documentElement.style.setProperty('--vvh', `${vvh}px`)
    document.documentElement.style.setProperty('--vvtop', `${vvtop}px`)
  }, KEYBOARD)
  await page.waitForTimeout(250)
  const kb = await dialog.boundingBox()
  const fitsKb = kb && kb.y >= KEYBOARD.vvtop - 1 && kb.y + kb.height <= KEYBOARD.vvtop + KEYBOARD.vvh + 1
  check(
    `${name} · stays inside the keyboard-shrunk region`,
    true,
    Boolean(fitsKb),
    kb ? `top ${Math.round(kb.y)}, bottom ${Math.round(kb.y + kb.height)} in [0, ${KEYBOARD.vvh}]` : 'no box',
  )
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--vvh')
    document.documentElement.style.removeProperty('--vvtop')
  })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
}

// ── The dialog from the bug report: BYOK provider form ─────────────────────
await page.goto(`${BASE}#/settings?tab=ai`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await page.getByRole('button', { name: /Add provider|New provider/ }).first().click()
await auditOpenDialog('Provider form (the reported bug)')

// ── New preset ──────────────────────────────────────────────────────────────
await page.getByRole('button', { name: 'New preset' }).click()
await auditOpenDialog('Preset form')

// ── New project ─────────────────────────────────────────────────────────────
await page.goto(`${BASE}#/projects`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'New project' }).first().click()
await auditOpenDialog('New project form')

// ── Auth sign-in ────────────────────────────────────────────────────────────
await page.goto(`${BASE}#/settings?tab=account`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
const signIn = page.getByRole('button', { name: 'Sign in' }).first()
if (await signIn.isVisible().catch(() => false)) {
  await signIn.click()
  await auditOpenDialog('Sign-in dialog')
}

// ── Card form + import preview ──────────────────────────────────────────────
await page.goto(`${BASE}#/playground/cards?project=${projectId}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'New card' }).click()
await auditOpenDialog('New card form')

// ── Word goal + sprint setup, in the editor ────────────────────────────────
await page.goto(`${BASE}#/editor?project=${projectId}`, { waitUntil: 'domcontentloaded' })
await page.locator('.editor-prose').first().waitFor({ timeout: 15000 })
const goalChip = page.getByRole('button', { name: 'Edit your daily word goal' })
if (await goalChip.isVisible().catch(() => false)) {
  await goalChip.click()
  await auditOpenDialog('Word goal dialog')
}

// ── Label manager, on Planning ──────────────────────────────────────────────
await page.goto(`${BASE}#/planning?project=${projectId}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Labels' }).click()
await auditOpenDialog('Label manager')

check('no uncaught errors anywhere along the way', [], pageErrors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
