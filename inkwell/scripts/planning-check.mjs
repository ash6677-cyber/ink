/**
 * §17 acceptance, through the real UI: the corkboard's index cards flip to
 * an editable beats face, and the label manager merges labels across the
 * whole book.
 *
 * The two plan promises, verified end to end:
 *   - Beats editable from the corkboard; the same beat then appears in the
 *     editor's scene panel (one store, one truth).
 *   - Merging two labels updates every scene carrying them — including the
 *     scene that carried both, which must end up with one copy, not two.
 *
 *   INKWELL_BASE_PATH=/ npm run build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/planning-check.mjs
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

await page.goto(`${BASE}#/projects`)
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
  const scene = (order, title, labels, beats) => ({
    id: id('s'), createdAt: now, updatedAt: now, projectId, chapterId, title, order,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `${title}.` }] }] },
    plainText: `${title}.`, wordCount: 2, status: 'drafting', povCharacterId: null,
    locationCodexId: null, summary: `Summary of ${title}`, beats, labels, linkedCodexIds: [],
  })
  await put('scenes', scene(0, 'Harbour Morning', ['ferry', 'storm'], [
    { id: id('b'), text: 'Maren opens the ledger', order: 0, generated: false },
  ]))
  await put('scenes', scene(1, 'The Long Walk', ['ferry'], []))
  await put('scenes', scene(2, 'Last Light', ['crossing'], []))
  db.close()
  return { projectId }
})

// ── Beats, from the corkboard ───────────────────────────────────────────────
await page.goto(`${BASE}#/planning?project=${projectId}`)
await page.waitForTimeout(1500)

check(
  'the card front shows its labels',
  true,
  (await page.locator('span', { hasText: /^ferry$/ }).count()) >= 2,
)

await page.getByRole('button', { name: 'Show beats for Harbour Morning' }).click()
await page.waitForTimeout(300)
check(
  'flipping shows the existing beat',
  'Maren opens the ledger',
  await page.getByRole('textbox', { name: 'Beat 1 of Harbour Morning' }).inputValue(),
)

await page.getByRole('button', { name: 'Add beat' }).first().click()
await page.waitForTimeout(300)
const newBeat = page.getByRole('textbox', { name: 'Beat 2 of Harbour Morning' })
await newBeat.fill('The storm hits the pier')
await newBeat.press('Enter')
await page.waitForTimeout(600)

// The editor's scene panel must show the same beat — one store, one truth.
await page.goto(`${BASE}#/editor?project=${projectId}`)
await page.waitForTimeout(1500)
check(
  'the beat typed on the corkboard is in the editor panel',
  true,
  (await page.locator('input[value="The storm hits the pier"], textarea', { hasText: '' }).evaluateAll((els) => els.some((el) => el.value === 'The storm hits the pier'))),
)

// …and it survived to disk, not just to memory.
const beatsOnDisk = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((res, rej) => {
    open.onsuccess = () => res(open.result)
    open.onerror = () => rej(open.error)
  })
  const scenes = await new Promise((res, rej) => {
    const tx = db.transaction('scenes', 'readonly')
    const req = tx.objectStore('scenes').getAll()
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
  db.close()
  return scenes.find((s) => s.title === 'Harbour Morning')?.beats.map((b) => b.text) ?? []
})
check('…and persisted', ['Maren opens the ledger', 'The storm hits the pier'], beatsOnDisk)

// ── Labels: merge and remove, across the book ──────────────────────────────
await page.goto(`${BASE}#/planning?project=${projectId}`)
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Labels' }).click()
await page.waitForTimeout(400)

check(
  'the manager lists every label with its count',
  true,
  (await page.getByText('2 scenes').count()) > 0 && (await page.getByText('1 scene', { exact: true }).count()) >= 2,
)

await page.getByRole('button', { name: 'Rename label ferry' }).click()
const renameInput = page.getByLabel('New name for label ferry')
await renameInput.fill('crossing')
check(
  'renaming onto an existing label announces the merge',
  true,
  (await page.getByText(/will merge into/).count()) > 0,
)
await renameInput.press('Enter')
await page.waitForTimeout(800)

const labelsAfterMerge = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((res, rej) => {
    open.onsuccess = () => res(open.result)
    open.onerror = () => rej(open.error)
  })
  const scenes = await new Promise((res, rej) => {
    const tx = db.transaction('scenes', 'readonly')
    const req = tx.objectStore('scenes').getAll()
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
  db.close()
  // Sorted by title: IndexedDB's getAll order is not deterministic, and the
  // check compares JSON — key order must not be what fails it.
  return Object.fromEntries(
    scenes
      .filter((s) => s.title !== undefined)
      .map((s) => [s.title, [...s.labels].sort()])
      .sort((a, b) => a[0].localeCompare(b[0])),
  )
})
check(
  'the merge updated every scene carrying either label',
  {
    'Harbour Morning': ['crossing', 'storm'],
    'Last Light': ['crossing'],
    'The Long Walk': ['crossing'],
  },
  labelsAfterMerge,
  'the scene that carried both has exactly one copy',
)
check(
  'the manager now shows the merged count',
  true,
  (await page.getByText('3 scenes').count()) > 0,
)
check('…and ferry is gone from the list', 0, await page.getByRole('button', { name: 'Rename label ferry' }).count())

await page.getByRole('button', { name: 'Remove label storm from every scene' }).click()
await page.waitForTimeout(600)
const stormLeft = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((res, rej) => {
    open.onsuccess = () => res(open.result)
    open.onerror = () => rej(open.error)
  })
  const scenes = await new Promise((res, rej) => {
    const tx = db.transaction('scenes', 'readonly')
    const req = tx.objectStore('scenes').getAll()
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
  db.close()
  return scenes.filter((s) => (s.labels ?? []).includes('storm')).length
})
check('removing a label strips it from every scene', 0, stormLeft)

check('no uncaught errors anywhere along the way', [], pageErrors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
