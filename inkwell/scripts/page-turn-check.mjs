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
check('…while the app around the book stays dark', true, palettes.htmlIsDark)
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

// ── Single-page (phone) mode: the destination is under the sheet ────────────
// The bug this guards against: 1-col mode painted the CURRENT page beneath
// a forward turn, so the sheet flew away to reveal an identical page — every
// turn read as "opened, then snapped back closed".
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
await page.getByRole('button', { name: 'Next page' }).click()
await page.waitForTimeout(120)
const underneath = await page.evaluate(() => {
  const side = document.querySelector('.book-side')
  return side ? side.textContent ?? '' : ''
})
check(
  'on a phone, the page beneath a lifting cover is already chapter one',
  true,
  underneath.includes('Chapter 1'),
  underneath.slice(0, 40),
)
const inFlightBounds = await page.evaluate(() => {
  const leaf = document.querySelector('.curl-leaf')
  if (!leaf) return null
  const r = leaf.getBoundingClientRect()
  return { spillsRight: r.right > window.innerWidth * 1.35, spillsLeft: r.left < -window.innerWidth * 0.35 }
})
check(
  'the turning sheet stays roughly on stage instead of ballooning away',
  true,
  inFlightBounds === null || (!inFlightBounds.spillsRight && !inFlightBounds.spillsLeft),
  JSON.stringify(inFlightBounds),
)
await page.waitForTimeout(1400)
check(
  'the phone turn lands on page one',
  true,
  (await footerText()).includes('page 1'),
  await footerText(),
)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
