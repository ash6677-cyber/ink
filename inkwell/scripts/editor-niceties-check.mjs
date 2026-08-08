/**
 * §11 acceptance, through the real UI.
 *
 *   - The daily word goal is editable from the editor in two clicks, and the
 *     Stats page shows the same number afterwards — one store, no drift.
 *   - Replace-all inside a scene touches that scene only: the same word in
 *     the next scene is still there on disk afterwards.
 *
 *   INKWELL_BASE_PATH=/ npm run build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/editor-niceties-check.mjs
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
  const scene = (order, title, text) => ({
    id: id('s'), createdAt: now, updatedAt: now, projectId, chapterId, title, order,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
    plainText: text, wordCount: text.split(/\s+/).length, status: 'drafting', povCharacterId: null,
    locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [],
  })
  await put('scenes', scene(0, 'Harbour Morning', 'The lantern swung. She trimmed the lantern and waited.'))
  await put('scenes', scene(1, 'The Long Walk', 'A second lantern burned in the far window.'))
  db.close()
  return { projectId }
})

// ── The goal, from the editor, in two clicks ────────────────────────────────
await page.goto(`${BASE}#/editor?project=${projectId}`)
await page.waitForTimeout(1500)

const goalChip = page.getByRole('button', { name: 'Edit your daily word goal' })
check('the goal chip is in the editor header', true, await goalChip.isVisible())
await goalChip.click() // click one
await page.waitForTimeout(300)
const goalInput = page.getByRole('spinbutton', { name: 'Daily word goal' })
check('one click opens the editor', true, await goalInput.isVisible())
await goalInput.fill('750')
await page.getByRole('button', { name: 'Save goal' }).click() // click two
await page.waitForTimeout(600)
check('the chip shows the new goal', true, (await goalChip.textContent()).includes('750'))

// Stats must show the same number without any further action.
await page.goto(`${BASE}#/stats?project=${projectId}`)
await page.waitForTimeout(1200)
const statsHasGoal = await page.evaluate(() => document.body.innerText.includes('750'))
check('Stats reflects the goal set from the editor', true, statsHasGoal)

// …and it reached disk.
const goalOnDisk = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((res, rej) => {
    open.onsuccess = () => res(open.result)
    open.onerror = () => rej(open.error)
  })
  const goals = await new Promise((res, rej) => {
    const tx = db.transaction('goals', 'readonly')
    const req = tx.objectStore('goals').getAll()
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
  db.close()
  return goals.map((g) => g.dailyWordTarget)
})
check('…and persisted', [750], goalOnDisk)

// ── Replace-in-scene stays in its scene ─────────────────────────────────────
await page.goto(`${BASE}#/editor?project=${projectId}`)
await page.waitForTimeout(1500)

await page.keyboard.press('Control+f')
await page.waitForTimeout(300)
const findInput = page.getByPlaceholder('Find in scene')
await findInput.fill('lantern')
await page.waitForTimeout(300)
check('find counts both matches in this scene', true, (await page.getByText('1 of 2').count()) > 0)

await page.getByRole('button', { name: 'Replace', exact: true }).click()
await page.getByPlaceholder('Replace with').fill('lamp')
await page.getByRole('button', { name: 'All', exact: true }).click()
// Autosave debounce, then the write itself.
await page.waitForTimeout(2500)

const textsOnDisk = await page.evaluate(async () => {
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
  return Object.fromEntries(
    scenes.map((s) => [s.title, s.plainText]).sort((a, b) => a[0].localeCompare(b[0])),
  )
})
check(
  'replace-all rewrote every match in the active scene',
  'The lamp swung. She trimmed the lamp and waited.',
  textsOnDisk['Harbour Morning'],
)
check(
  '…and left the other scene untouched',
  'A second lantern burned in the far window.',
  textsOnDisk['The Long Walk'],
)

check('no uncaught errors anywhere along the way', [], pageErrors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
