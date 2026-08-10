/**
 * Per-chapter word targets, proven live: a chapter with a target shows a
 * little progress ring in the manuscript tree (green once met), a chapter
 * without one shows nothing, and the chapter menu's "Set word target…"
 * dialog wires the whole loop — set a target, watch the ring appear.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/chapter-target-check.mjs
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
const eventually = async (p, t = 15000) => {
  const d = Date.now() + t
  for (;;) {
    const v = await p()
    if (v) return v
    if (Date.now() > d) return false
    await new Promise((r) => setTimeout(r, 200))
  }
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(900)
const ids = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
  const words = (n, w) => Array.from({ length: n }, () => w).join(' ')
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Target Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  // Three chapters: 300/1000 (partial ring), 150/100 (met, green), no target.
  const specs = [
    { title: 'Partway There', target: 1000, wordCount: 300 },
    { title: 'Done And Then Some', target: 100, wordCount: 150 },
    { title: 'No Target Here', target: null, wordCount: 200 },
  ]
  let order = 0
  for (const spec of specs) {
    const cid = id('ch')
    const chapter = { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: spec.title, order, status: 'drafting' }
    if (spec.target !== null) chapter.targetWords = spec.target
    await put('chapters', chapter)
    const t = words(spec.wordCount, 'ink')
    await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: 'Scene 1', order: 0, content: doc(t), plainText: t, wordCount: spec.wordCount, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
    order++
  }
  db.close()
  return { pid }
})

await page.goto(`${BASE}#/editor?project=${ids.pid}`)
await eventually(async () => (await page.getByText('Partway There').count()) > 0)

// Two rings for the two targeted chapters; the target-less one stays bare.
const ringCount = await eventually(async () => {
  const n = await page.locator('[data-chapter-target-ring]').count()
  return n === 2 ? 2 : false
})
check('exactly the two targeted chapters wear rings', 2, ringCount)

check(
  'the partial ring reports words remaining',
  true,
  (await page.getByLabel('300 of 1,000 words — 700 to go').count()) > 0,
)
check(
  'the met ring says so (and runs past 100%)',
  true,
  (await page.getByLabel('Target met — 150 of 100 words (150%)').count()) > 0,
)
const metRingGreen = await page
  .getByLabel('Target met — 150 of 100 words (150%)')
  .locator('circle.stroke-success')
  .count()
check('the met ring is painted success-green', true, metRingGreen > 0)

// The full loop: give the bare chapter a target through the menu dialog.
const bareRow = page.locator('.group', { hasText: 'No Target Here' }).first()
await bareRow.hover()
await bareRow.getByLabel('More actions for No Target Here').click()
await page.getByText('Set word target…').click()
await eventually(async () => (await page.getByLabel('Chapter word target').count()) > 0)
await page.getByLabel('Chapter word target').fill('400')
await page.getByRole('button', { name: 'Save target' }).click()

const thirdRing = await eventually(async () => {
  const n = await page.locator('[data-chapter-target-ring]').count()
  return n === 3 ? 3 : false
})
check('setting a target through the dialog grows a ring live', 3, thirdRing)
check(
  'the new ring reflects 200 of 400 words',
  true,
  (await page.getByLabel('200 of 400 words — 200 to go').count()) > 0,
)

// And it persists: reload, ring still there.
await page.reload()
await eventually(async () => (await page.getByText('No Target Here').count()) > 0)
const persisted = await eventually(async () => {
  const n = await page.locator('[data-chapter-target-ring]').count()
  return n === 3 ? 3 : false
})
check('targets survive a reload (stored on the chapter)', 3, persisted)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
