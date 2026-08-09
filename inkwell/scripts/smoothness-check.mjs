/**
 * The feel of moving around the app, held to account: screens must be
 * warmed in the background after boot (never before the load event, never
 * a Firebase chunk while signed out), hopping between screens must never
 * flash the route loader, and taps must not pay the double-tap-zoom tax.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/smoothness-check.mjs
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
// Service workers precache every chunk, which hides real network
// behavior from request counting — block them so the prefetcher's
// fetches are raw and observable.
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'block',
})
const page = await ctx.newPage()

const jsRequests = []
page.on('request', (r) => {
  if (r.url().endsWith('.js')) jsRequests.push(r.url().split('/').pop())
})

// Snapshot the boot graph IMMEDIATELY at domcontentloaded — the idle
// prefetcher fires within a second on an idle page, and sampling late
// would double-count its work as "boot".
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
const bootCount = jsRequests.length

await page.waitForTimeout(8000)
const warmedCount = jsRequests.length
check('idle prefetch fetches the other screens after boot', true, warmedCount > bootCount + 5,
  `${bootCount} boot chunks → ${warmedCount} after idle`)

const firebase = jsRequests.filter((n) => /firebase/i.test(n))
check('…and still zero Firebase bytes while signed out', [], firebase)

// With everything warm, hopping across screens must never flash a loader.
const routes = ['#/planning', '#/stats', '#/almanac', '#/settings', '#/covers', '#/series']
let sawSpinner = false
for (const route of routes) {
  // Navigate the way a user does — inside the app, no page reload.
  await page.evaluate((h) => { window.location.hash = h.slice(1) }, route)
  for (let i = 0; i < 10; i++) {
    // Only the ROUTE loader counts (screens may show their own data
    // spinners) — and only when its delayed reveal has actually made it
    // visible; an opacity-0 placeholder is exactly the point.
    const visible = await page.evaluate(() =>
      [...document.querySelectorAll('div')].some((el) => {
        const cs = getComputedStyle(el)
        return cs.animationName.includes('route-loading-reveal') && Number(cs.opacity) > 0.05
      }),
    )
    if (visible) sawSpinner = true
    await page.waitForTimeout(30)
  }
}
check('hopping across six screens never shows the route loader', false, sawSpinner)

// Tap responsiveness: interactive elements must carry touch-action so the
// browser doesn't hold taps hostage for double-tap zoom.
await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(800)
const touchAction = await page.evaluate(() => {
  const button = document.querySelector('button')
  const link = document.querySelector('a')
  return {
    button: button ? getComputedStyle(button).touchAction : 'none-found',
    link: link ? getComputedStyle(link).touchAction : 'none-found',
    tapHighlight: getComputedStyle(document.documentElement).webkitTapHighlightColor ?? 'unsupported',
  }
})
check('buttons fire taps immediately (touch-action: manipulation)', 'manipulation', touchAction.button)
check('links too', 'manipulation', touchAction.link)
console.log(`INFO · tap highlight → ${touchAction.tapHighlight}`)

const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
