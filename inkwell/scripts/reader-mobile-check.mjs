/**
 * The reader on a phone (plan §8.1).
 *
 * The plan expected a fixed two-page spread to be the casualty here. It is
 * not — the reader already collapses to one page below `sm`. What was
 * actually wrong was subtler and only visible by opening it: justified text
 * opening rivers at a thirty-character measure, a tap that refused to turn
 * the page, and a drag that would fight the operating system's back gesture
 * for the left edge of the screen.
 *
 *   INKWELL_BASE_PATH=/ npm run build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/reader-mobile-check.mjs
 */
const { chromium, devices } = await import(
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
const ctx = await browser.newContext({
  ...devices['iPhone 12'],
  viewport: { width: 360, height: 640 },
  isMobile: true,
  hasTouch: true,
})
const page = await ctx.newPage()

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(900)
const projectId = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => {
    open.onsuccess = () => r(open.result)
  })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) =>
    new Promise((res) => {
      const tx = db.transaction(s, 'readwrite')
      tx.objectStore(s).put(v)
      tx.oncomplete = res
    })
  const pid = id('p')
  await put('projects', {
    id: pid, createdAt: now, updatedAt: now, title: 'The Salt Road', author: 'A. Richards',
    synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null,
    seriesOrder: 0, status: 'drafting',
    settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' },
  })
  for (let c = 0; c < 2; c++) {
    const cid = id('ch')
    await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: `Chapter ${c + 1}`, order: c, status: 'draft' })
    await put('scenes', {
      id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid,
      title: 'Scene 1', order: 0, content: null,
      plainText: 'The caravan came down out of the hills at dusk, and the salt on the wind tasted of somewhere else entirely. '.repeat(14),
      wordCount: 300, status: 'draft', povCharacterId: null, locationCodexId: null,
      summary: '', beats: [], labels: [], linkedCodexIds: [],
    })
  }
  db.close()
  return pid
})
await page.goto(`${BASE}#/read?project=${projectId}`)
await page.waitForTimeout(1800)

/** Which page the footer says we are on. */
const where = async () => (await page.locator('footer').innerText()).replace(/\s+/g, ' ').trim()

check('the reader opens', true, (await where()).length > 0, await where())

// ── One page, not a spread squeezed onto a phone ────────────────────────────
const layout = await page.evaluate(() => {
  const pages = [...document.querySelectorAll('[class*="book-page"]')]
    .map((n) => n.getBoundingClientRect())
    .filter((r) => r.width > 80)
  return {
    pagesOnScreen: pages.length,
    widest: Math.round(Math.max(0, ...pages.map((r) => r.width))),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }
})
check('no horizontal overflow', 0, layout.overflow)
check('the page fits the screen', true, layout.widest <= 360, `widest ${layout.widest}px`)

// ── Ragged right, because justification opens rivers at this measure ────────
const align = await page.evaluate(() => {
  const flow = document.querySelector('.book-flow')
  return flow ? getComputedStyle(flow).textAlign : null
})
check('prose is ragged right on a phone', 'left', align)

// ── A tap turns the page ────────────────────────────────────────────────────
// Aimed at the stage — the element that owns the pointer handlers — since
// the two-up spread layers pages over each other and a finger doesn't care
// which element is topmost.
const before = await where()
const stageBox = await page.locator('.book-stage').boundingBox()
await page.touchscreen.tap(stageBox.x + stageBox.width * 0.8, stageBox.y + stageBox.height / 2)
await page.waitForTimeout(1200)
const afterTap = await where()
check('tapping the right of the spread turns forward', true, afterTap !== before, `${before} → ${afterTap}`)

await page.touchscreen.tap(stageBox.x + stageBox.width * 0.2, stageBox.y + stageBox.height / 2)
await page.waitForTimeout(1200)
check('tapping the left turns back', before, await where())

// ── The left screen edge belongs to the OS ──────────────────────────────────
const atEdge = await where()
await page.touchscreen.tap(6, 320)
await page.waitForTimeout(900)
check('a tap in the OS back-gesture strip is ignored', atEdge, await where(), 'x=6px')

// The buttons still work, from anywhere.
await page.getByRole('button', { name: /Next page/i }).click()
await page.waitForTimeout(1100)
check('the turn button still works', true, (await where()) !== atEdge)

// ── And the way out is reachable ────────────────────────────────────────────
check('an exit is on screen', true, await page.getByRole('link', { name: /Back to editor/i }).isVisible())

await browser.close()
console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
