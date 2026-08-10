/**
 * Year in review, proven live: the Stats page grows a "Year in review"
 * button; the dialog shows the year's honest numbers (total words, days,
 * best streak, biggest day) beside a canvas card drawn at share size
 * (1080×1350) that has genuinely been painted — not a blank rectangle.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/year-review-check.mjs
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
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(700)
await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = new Date()
  const year = now.getFullYear()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const pid = id('p')
  const t0 = Date.now()
  await put('projects', { id: pid, createdAt: t0, updatedAt: t0, title: 'Year Book', author: 'A. Writer', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  // A knowable year, all in the past of "now": Jan 2+3+4 (streak of 3,
  // 500 each), Feb 1 (2,000 — the biggest day), March 10 (250).
  // Guard: if today is Jan 1, those dates would be in the future — pin
  // sessions to hours that are already past on the same day instead.
  const mk = async (m, d, words) => {
    const when = new Date(year, m, d, 9, 0).getTime()
    if (when > Date.now()) return 0
    await put('sessionLogs', { id: id('s'), createdAt: when, updatedAt: when, projectId: pid, wordsWritten: words, startedAt: when, endedAt: when + 30 * 60000 })
    return words
  }
  let total = 0
  total += await mk(0, 2, 500)
  total += await mk(0, 3, 500)
  total += await mk(0, 4, 500)
  total += await mk(1, 1, 2000)
  total += await mk(2, 10, 250)
  db.close()
  window.__seedTotal = total
})
const seedTotal = await page.evaluate(() => window.__seedTotal)
check('seeded a full year of sessions (harness clock sanity)', 3750, seedTotal)

await page.goto(`${BASE}#/stats`)
await page.reload()
await eventually(async () => (await page.getByRole('button', { name: 'Open your year in review' }).count()) > 0)
check('the Year in review button is on Stats', true, true)

await page.getByRole('button', { name: 'Open your year in review' }).click()
await eventually(async () => (await page.locator('[data-year-review-stats]').count()) > 0)

const stats = page.locator('[data-year-review-stats]')
check('total words for the year', true, (await stats.getByText('3,750').count()) > 0)
check('best streak of three days', true, (await stats.getByText('3 days').count()) > 0)
check('biggest day names its words', true, (await stats.getByText('2,000').count()) > 0)
check(
  'days at the desk counted',
  true,
  (await stats.locator('dd').filter({ hasText: /^5$/ }).count()) > 0,
)

// The canvas: right size, and actually painted (many distinct colours).
const painted = await page.evaluate(() => {
  const canvas = document.querySelector('canvas[aria-label*="writing year card"]')
  if (!canvas) return { ok: false, why: 'no year-card canvas' }
  if (canvas.width !== 1080 || canvas.height !== 1350)
    return { ok: false, why: `size ${canvas.width}x${canvas.height}` }
  const ctx = canvas.getContext('2d')
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const colours = new Set()
  for (let i = 0; i < data.length; i += 4096) {
    colours.add(`${data[i]},${data[i + 1]},${data[i + 2]}`)
  }
  return { ok: colours.size > 40, why: `${colours.size} sampled colours` }
})
check('the card canvas is 1080×1350 and painted', true, painted.ok, painted.why)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
