/**
 * The page must TURN — from every trigger — and the book viewer must hold
 * its own light. The curl engine always existed for drags; the footer
 * buttons used to swap pages instantly and skip it, which on a phone (where
 * the buttons are the main way to read) meant nobody ever saw a page move.
 *
 * Also proves the reader-only theme island: flipping the viewer to light
 * pages must recolour the book and nothing else, and must survive a reload.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/page-turn-check.mjs
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

async function seedBook(page) {
  await page.goto(`${BASE}#/projects`)
  await page.waitForTimeout(900)
  return await page.evaluate(async () => {
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
      id: pid, createdAt: now, updatedAt: now, title: 'The Turning Tide', author: 'A. Richards',
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
        plainText: 'The tide turned pages of its own out on the flats, and nobody read them but the birds. '.repeat(16),
        wordCount: 288, status: 'draft', povCharacterId: null, locationCodexId: null,
        summary: '', beats: [], labels: [], linkedCodexIds: [],
      })
    }
    db.close()
    return pid
  })
}

/** Perceived lightness 0–255-ish, for both rgb() and oklch() strings —
 * Chromium reports whichever notation the stylesheet used. */
const brightness = (color) => {
  const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color)
  if (rgb) return (Number(rgb[1]) + Number(rgb[2]) + Number(rgb[3])) / 3
  const oklch = /oklch\(([\d.]+%?)/.exec(color)
  if (!oklch) return NaN
  const raw = oklch[1].endsWith('%') ? Number(oklch[1].slice(0, -1)) / 100 : Number(oklch[1])
  return raw * 255
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

const projectId = await seedBook(page)
await page.goto(`${BASE}#/read?project=${projectId}`)
await page.waitForTimeout(1800)

const footerText = async () => (await page.locator('footer').innerText()).replace(/\s+/g, ' ').trim()

// ── The button turn is a real turn ──────────────────────────────────────────
const before = await footerText()
await page.getByRole('button', { name: 'Next page' }).click()
// Sampled right away, while the sheet should still be in flight.
await page.waitForTimeout(90)
const leafInFlight = await page.locator('.curl-leaf').count()
check('clicking Next puts a bending sheet in the air', true, leafInFlight > 0)

const midFlight = await page.evaluate(() => {
  const segment = document.querySelector('.curl-segment')
  return segment ? getComputedStyle(segment).transform !== 'none' : false
})
check('…whose segments carry live 3D transforms', true, midFlight)

await page.waitForTimeout(1400)
const after = await footerText()
check('…and the turn lands on the next page', true, before !== after, `${before} → ${after}`)
check('the leaf leaves the stage once settled', 0, await page.locator('.curl-leaf').count())

await page.getByRole('button', { name: 'Previous page' }).click()
await page.waitForTimeout(90)
check('Previous turns a sheet too', true, (await page.locator('.curl-leaf').count()) > 0)
await page.waitForTimeout(1400)

// ── Reduced motion is honoured ──────────────────────────────────────────────
// Same page, emulated media — a new context would have an empty database.
await page.emulateMedia({ reducedMotion: 'reduce' })
const rmBefore = await footerText()
await page.getByRole('button', { name: 'Next page' }).click()
await page.waitForTimeout(300)
const rmAfter = await footerText()
check('reduced-motion readers still get the page, instantly', true, rmBefore !== rmAfter)
await page.getByRole('button', { name: 'Previous page' }).click()
await page.waitForTimeout(300)
await page.emulateMedia({ reducedMotion: null })

// ── The viewer's own light switch ───────────────────────────────────────────
// The app defaults to dark, so the book starts on dark paper and the toggle
// offers light pages.
const paperBefore = await page.evaluate(() => {
  const node = document.querySelector('[class*="book-page"], .book-flow')
  return node ? getComputedStyle(node).backgroundColor : ''
})
check(
  'the toggle is easy to spot and offers light pages in a dark app',
  true,
  (await page.getByRole('button', { name: /light pages/i }).count()) > 0,
)

await page.getByRole('button', { name: /light pages/i }).click()
await page.waitForTimeout(400)
const palettes = await page.evaluate(() => {
  const pageNode = document.querySelector('[class*="book-page"], .book-flow')
  const shell = document.querySelector('nav a, nav button')?.closest('nav')
  return {
    paper: pageNode ? getComputedStyle(pageNode).backgroundColor : '',
    shell: shell ? getComputedStyle(shell).backgroundColor : '',
    htmlIsDark: document.documentElement.classList.contains('dark'),
  }
})
check(
  'light pages actually lighten the paper',
  true,
  brightness(palettes.paper) > brightness(paperBefore) + 60,
  `${paperBefore} → ${palettes.paper}`,
)
// By explicit decision the switch re-skins ONLY the paper: the ground
// around the book keeps the app theme, like a reading lamp on the page.
const ground = await page.evaluate(() => {
  const reader = document.querySelector('.book-reader')
  if (!reader) return ''
  const img = getComputedStyle(reader).backgroundImage
  return /oklch\([^)]+\)|rgba?\([^)]+\)/.exec(img)?.[0] ?? getComputedStyle(reader).backgroundColor
})
check(
  '…while the ground around the book keeps the app theme',
  true,
  brightness(ground) < 100,
  ground,
)
check('…and the app around the book stays dark', true, palettes.htmlIsDark)
check(
  'the toggle now offers the way back',
  true,
  (await page.getByRole('button', { name: /dark pages/i }).count()) > 0,
)

await page.reload()
await page.waitForTimeout(1800)
const persisted = await page.evaluate(() => {
  const node = document.querySelector('[class*="book-page"], .book-flow')
  return node ? getComputedStyle(node).backgroundColor : ''
})
check(
  'the choice survives a reload',
  true,
  brightness(persisted) > brightness(paperBefore) + 60,
  persisted,
)

// ── The phone shows a real open book: two smaller facing pages ──────────────
// One-page mode is gone by design: the turn pivots at the spine, and a
// spine with no facing page swung half of every turn off-screen. Two-up,
// the sheet always has somewhere on-screen to land.
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(900)
// The backup nudge would sit exactly over the footer buttons — snooze it
// without disturbing the rest of the persisted preferences.
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('inkwell-preferences') ?? '{"state":{},"version":0}')
  raw.state.backupSnoozedUntil = Date.now() + 86400000
  localStorage.setItem('inkwell-preferences', JSON.stringify(raw))
})
// Back to the front cover so the flight is unmistakable: cover lifts,
// chapter one must already be waiting underneath.
await page.evaluate(() => window.location.reload())
await page.waitForTimeout(1800)
while ((await footerText()).includes('page')) {
  await page.getByRole('button', { name: 'Previous page' }).click()
  await page.waitForTimeout(700)
}
const spread = await page.evaluate(() => {
  const pages = [...document.querySelectorAll('.book-side .book-page')].map((n) =>
    n.getBoundingClientRect(),
  )
  return {
    count: pages.length,
    allOn: pages.every((r) => r.left >= -2 && r.right <= window.innerWidth + 2),
    widths: pages.map((r) => Math.round(r.width)),
  }
})
check('the phone shows two facing pages', 2, spread.count, spread.widths.join('+'))
check('…both fully on screen', true, spread.allOn)

const typeScale = await page.evaluate(() => {
  const stage = document.querySelector('.book-stage')?.parentElement
  return stage ? getComputedStyle(stage).getPropertyValue('--page-fit-scale').trim() : ''
})
check(
  'the type scales down with the smaller pages',
  true,
  Number(typeScale) > 0.5 && Number(typeScale) < 1,
  typeScale,
)

await page.getByRole('button', { name: 'Next page' }).click()
await page.waitForTimeout(120)
// Sampled across the WHOLE turn, not one early frame: the field bug was a
// spine-pivoted flip whose entire second half swung off the left of the
// screen — "off centre, half of it not visible". Centre-pivoted, every
// frame must stay on the page's own footprint.
const flightSamples = []
for (let i = 0; i < 14; i++) {
  const sample = await page.evaluate(() => {
    const leaf = document.querySelector('.curl-leaf')
    if (!leaf) return null
    const r = leaf.getBoundingClientRect()
    return { left: Math.round(r.left), right: Math.round(r.right), width: window.innerWidth }
  })
  if (sample) flightSamples.push(sample)
  await page.waitForTimeout(60)
}
const offStage = flightSamples.filter(
  (s) => s.left < -40 || s.right > s.width + 40,
)
check(
  'every sampled frame of the phone turn stays on screen',
  0,
  offStage.length,
  `${flightSamples.length} frames sampled, worst: ${JSON.stringify(offStage[0] ?? null)}`,
)
await page.waitForTimeout(1400)
check(
  'the phone turn lands on the next spread',
  true,
  (await footerText()).includes('page 2'),
  await footerText(),
)

// ── Impatient tapping must never snap the book backward ─────────────────────
// The field bug: a tap during an in-flight turn used to trigger a raw index
// swap, and the airborne turn's stale commit then landed on top of it —
// the page visibly snapped back. Taps during flight are now swallowed.
const pageNo = (text) => Number(/page (\d+)/.exec(text)?.[1] ?? 0)
const startNo = pageNo(await footerText())
const seen = []
for (let tap = 0; tap < 4; tap++) {
  await page.getByRole('button', { name: 'Next page' }).click()
  await page.waitForTimeout(70)
}
for (let i = 0; i < 30; i++) {
  seen.push(pageNo(await footerText()))
  await page.waitForTimeout(90)
}
const wentBackward = seen.some((value, i) => i > 0 && value < seen[i - 1])
check('a burst of taps never snaps the page backward', false, wentBackward, seen.join(','))
check('…and lands ahead of where it started', true, seen[seen.length - 1] > startNo,
  `${startNo} → ${seen[seen.length - 1]}`)
await page.waitForTimeout(600)
check('…with no sheet left stranded mid-air', 0, await page.locator('.curl-leaf').count())
const folio = await page.evaluate(() => {
  const side = document.querySelector('.book-side .book-folio')
  return side ? side.textContent : ''
})
check(
  'the page on display matches the page the footer claims',
  String(pageNo(await footerText())),
  folio ?? '',
)

check('no uncaught errors', [], errors)

// ── WebKit engines get the flat flip, and it still turns pages ─────────────
// Safari (and every iPhone browser — all WebKit) mis-composites the
// segmented preserve-3d sheet, so on that engine the leaf renders as ONE
// segment: a plain flip it can composite. Chromium can't reproduce the
// Safari bug itself, but it CAN prove the engine detection and that the
// degraded sheet still commits turns correctly.
const wkCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
})
const wkPage = await wkCtx.newPage()
const wkErrors = []
wkPage.on('pageerror', (e) => wkErrors.push(String(e)))
const wkProject = await seedBook(wkPage)
await wkPage.goto(`${BASE}#/read?project=${wkProject}`)
await wkPage.waitForTimeout(1800)
const wkFooter = async () => (await wkPage.locator('footer').innerText()).replace(/\s+/g, ' ').trim()
const wkBefore = await wkFooter()
await wkPage.getByRole('button', { name: 'Next page' }).click()
await wkPage.waitForTimeout(90)
check(
  'a WebKit user agent gets the single-segment flip',
  1,
  await wkPage.locator('.curl-segment').count(),
)
await wkPage.waitForTimeout(1400)
check('…which still lands the turn', true, wkBefore !== (await wkFooter()), await wkFooter())
check('…with no sheet left behind', 0, await wkPage.locator('.curl-leaf').count())
check('…and no errors on the WebKit path', [], wkErrors)
await wkCtx.close()

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
