/**
 * The submission tracker, proven live: seed a querying campaign — one
 * market long overdue, one freshly queried, one pass — the board files
 * each in its column with honest day counts, the overdue card wears its
 * badge, the summary reads the whole trail in one line, a new market
 * added through the form lands on the shortlist, moving it out stamps
 * its send date exactly once, and everything survives a reload.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/submissions-check.mjs
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
const eventually = async (p, t = 20000) => {
  const d = Date.now() + t
  for (;;) {
    const v = await p()
    if (v) return v
    if (Date.now() > d) return false
    await new Promise((r) => setTimeout(r, 300))
  }
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(800)
const ids = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const DAY = 86_400_000
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Query Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'complete', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const sub = (market, status, sentDaysAgo, respondDaysFromNow) =>
    put('submissions', { id: id('sub'), createdAt: now, updatedAt: now, projectId: pid, market, contact: '', status, sentAt: sentDaysAgo === null ? null : now - sentDaysAgo * DAY, respondBy: respondDaysFromNow === null ? null : now + respondDaysFromNow * DAY, notes: '' })
  await sub('Harbour Literary', 'queried', 45, -5) // long out, overdue
  await sub('Northlight Agency', 'queried', 3, 30) // fresh, on time
  await sub('Bright Press', 'pass', 60, null)
  db.close()
  return { pid }
})

// ---- The board files everyone honestly. ----
await page.goto(`${BASE}#/planning?project=${ids.pid}`)
await eventually(async () => (await page.getByRole('tab', { name: 'Submissions' }).count()) > 0)
await page.getByRole('tab', { name: 'Submissions' }).click()
await eventually(async () => (await page.locator('[data-submissions]').count()) > 0)
const board = await page.locator('[data-submissions]').innerText()
check('every market has its card', true,
  /Harbour Literary/.test(board) && /Northlight Agency/.test(board) && /Bright Press/.test(board))
check('the day counters count', true, /45d out/.test(board) && /3d out/.test(board))
check('only the late one wears the overdue badge', 1, await page.getByText('overdue', { exact: true }).count())
check('the summary reads the trail in one line', '2 out · 1 overdue',
  await page.locator('[data-campaign-summary]').innerText())

// ---- A new market lands on the shortlist. ----
await page.locator('#sub-market').fill('Copper Quill Agency')
await page.getByRole('button', { name: 'Add', exact: true }).click()
await eventually(async () => /Copper Quill Agency/.test(await page.locator('[data-submissions]').innerText()))
check('the form adds to the shortlist', true, true)

// ---- Moving it out stamps the send date once. ----
await page.getByRole('combobox', { name: 'Status of Copper Quill Agency' }).click()
await page.getByRole('option', { name: 'Queried' }).click()
await eventually(async () => {
  const text = await page.locator('[data-submissions]').innerText()
  return /Copper Quill Agency[\s\S]*?0d out/.test(text)
})
check('leaving the shortlist stamps the send date', true, true)
check('the summary keeps up', '3 out · 1 overdue',
  await page.locator('[data-campaign-summary]').innerText())

// ---- A request escalates the column, and the stamp holds. ----
await page.getByRole('combobox', { name: 'Status of Copper Quill Agency' }).click()
await page.getByRole('option', { name: 'Full requested' }).click()
await eventually(async () => /3 out · 1 request · 1 overdue/.test(
  await page.locator('[data-campaign-summary]').innerText()))
check('a full request shows in the summary', true, true)

// ---- Survives a reload. ----
await page.reload()
await eventually(async () => (await page.getByRole('tab', { name: 'Submissions' }).count()) > 0)
await page.getByRole('tab', { name: 'Submissions' }).click()
const persisted = await eventually(async () => {
  const text = await page.locator('[data-submissions]').innerText().catch(() => '')
  return /Copper Quill Agency/.test(text) && /Full requested[\s\S]*?1/.test(text)
})
check('the whole campaign survives a reload', true, persisted)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
