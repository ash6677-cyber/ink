/**
 * The last acceptance boxes, through the real UI.
 *
 *   - §12: a relationship chip navigates to its target, and the target
 *     shows the reverse link ("Pointed here by") pointing back.
 *   - §20: searching "autosave" in Settings lands on the control, and
 *     changing the dial observably changes the editor's save debounce.
 *
 *   INKWELL_BASE_PATH=/ npm run build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/finishing-touches-check.mjs
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

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

await page.goto(`${BASE}#/projects`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)

const { projectId, marenId, eddaId } = await page.evaluate(async () => {
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
    order: 0, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The tide came in.' }] }] },
    plainText: 'The tide came in.', wordCount: 4, status: 'drafting', povCharacterId: null,
    locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [],
  })
  const entry = (name) => ({
    id: id('e'), createdAt: now, updatedAt: now, projectId, seriesId: null, type: 'character',
    name, aliases: [], summary: `${name}.`, body: null, plainText: '', attributes: [],
    relationships: [], imageId: null, tags: [], aiContext: 'when-relevant', aiContextTokenBudget: null,
  })
  const maren = entry('Maren Voss')
  const edda = entry('Edda Voss')
  edda.relationships = [{ id: id('r'), targetEntryId: maren.id, label: 'mother of' }]
  await put('codexEntries', maren)
  await put('codexEntries', edda)
  db.close()
  return { projectId, marenId: maren.id, eddaId: edda.id }
})

// ── §12: forward link, then the reverse on the target ──────────────────────
await page.goto(`${BASE}#/almanac/${eddaId}?project=${projectId}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
const forward = page.getByRole('button', { name: /mother of.*Maren Voss/ })
check('the relationship chip is on the source entry', true, (await forward.count()) > 0)
await forward.click()
await page.waitForTimeout(1000)
check('…and navigates to its target', true, page.url().includes(marenId))
const reverse = page.getByRole('button', { name: /Edda Voss.*mother of/ })
check('the target shows the reverse link', true, (await reverse.count()) > 0)
check(
  '…under a heading that says which way it points',
  true,
  (await page.getByText('Pointed here by').count()) > 0,
)
await reverse.click()
await page.waitForTimeout(1000)
check('…and the reverse link navigates back', true, page.url().includes(eddaId))

// ── §20: search lands on the control ────────────────────────────────────────
await page.goto(`${BASE}#/settings`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
await page.getByLabel('Search settings').fill('autosave')
await page.waitForTimeout(300)
const hit = page.getByRole('button', { name: /Autosave delay/ })
check('searching "autosave" offers the control', true, (await hit.count()) > 0)
await hit.click()
await page.waitForTimeout(800)
check(
  '…and lands on it, on the right tab',
  true,
  await page.locator('#setting-autosave').isVisible(),
)

// ── §20: the dial observably changes the debounce ───────────────────────────
// Turn the delay up to 3 seconds through the real control.
await page.locator('#setting-autosave input[type="range"]').evaluate((el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(el, '3000')
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
})
await page.waitForTimeout(400)
const stored = await page.evaluate(
  () => JSON.parse(localStorage.getItem('inkwell-preferences') ?? '{}').state?.autosaveDelayMs,
)
check('the dial persists the new delay', 3000, stored)

await page.goto(`${BASE}#/editor?project=${projectId}`, { waitUntil: 'domcontentloaded' })
await page.locator('.editor-prose').first().waitFor({ timeout: 15000 })
await page.locator('.editor-prose').click()
await page.keyboard.type(' More words.')
// At 1.5s after the last keystroke: the old 800ms debounce would have
// saved already; the new 3s one must still be holding the write.
await page.waitForTimeout(1500)
const midState = await page.getByText('Unsaved changes').count()
check('at 1.5s the editor is still holding the write (3s debounce live)', true, midState > 0)
await page.waitForTimeout(3000)
check(
  '…and it saves once the new delay elapses',
  true,
  (await page.getByText(/Saved/).count()) > 0,
)

check('no uncaught errors anywhere along the way', [], pageErrors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
