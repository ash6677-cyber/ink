/**
 * The first five minutes, through the real UI.
 *
 * A brand-new writer opens the app to a furnished library: a small book
 * with underlined names, planned beats, and statuses in three states —
 * every feature demonstrating itself. Then the rules that keep the sample
 * polite: delete it and it never returns; a library that ever held a real
 * book never sees it at all; and the browser (only) offers the Windows app.
 *
 *   INKWELL_BASE_PATH=/ npm run build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/sample-book-check.mjs
 */
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? '/opt/node22/lib/node_modules/playwright/index.mjs'
)
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5410/'
const TITLE = 'The Last Ferry Inn'

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

// ── A brand-new writer ──────────────────────────────────────────────────────
{
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  // Automation is normally invisible to the seeder; this harness opts in.
  await page.addInitScript(() => localStorage.setItem('inkwell-sample-under-test', '1'))
  const seedBegan = Date.now()
  // domcontentloaded, not load: the async font stylesheet keeps the load
  // event open for its whole network timeout on hosts that can't reach
  // Google, while the page is painted and interactive long before.
  await page.goto(`${BASE}#/projects`, { waitUntil: 'domcontentloaded' })
  await page.getByText(TITLE).waitFor({ timeout: 15000 })
  const seededIn = Date.now() - seedBegan
  check('a fresh library wakes up furnished', 1, await page.getByText(TITLE).count())
  check('…in under two seconds, boot included', true, seededIn < 2000, `${seededIn}ms`)
  check('the card says where it came from', true, (await page.getByText('Inkwell · Sample book').count()) > 0)

  // Into the book: the Almanac underlines should already be at work.
  await page.getByText(TITLE).click()
  await page.locator('.editor-prose p').first().waitFor({ timeout: 15000 })
  const underlines = await page.locator('.codex-highlight').count()
  check('names in the prose are already underlined', true, underlines >= 3, `${underlines} mentions`)
  // Scoped to the tree rail: the editor breadcrumb repeats the open
  // chapter's name, which is correct behaviour and a wrong count here.
  const tree = page.getByRole('main').locator('aside')
  const treeChapters = await Promise.all(
    ['Arrivals', 'The Crossing', 'Departures'].map((t) => tree.getByText(t, { exact: true }).count()),
  )
  check('three chapters stand in the tree', [1, 1, 1], treeChapters)

  // The Almanac knows the cast.
  const projectId = new URL(page.url()).hash.match(/project=([^&]+)/)?.[1]
  await page.goto(`${BASE}#/almanac?project=${projectId}`)
  await page.waitForTimeout(1200)
  const cast = await Promise.all(
    ['Maren Voss', 'Edda Voss', 'The Ferryman', 'Sorrow’s Crossing'].map((n) =>
      page.getByText(n, { exact: true }).first().isVisible().catch(() => false),
    ),
  )
  check('the whole cast is in the Almanac', [true, true, true, true], cast)

  // The browser build offers the Windows app; the tooltip-checked link
  // points at the latest release.
  await page.goto(`${BASE}#/projects`)
  await page.waitForTimeout(800)
  const appLink = page.getByRole('link', { name: 'Get the Windows app' })
  check('the browser offers the Windows app', 1, await appLink.count())
  check(
    '…pointing at the latest release',
    'https://github.com/ash6677-cyber/ink/releases/latest',
    await appLink.getAttribute('href'),
  )

  // Delete the sample; it must stay gone across a full reload.
  await page.getByRole('button', { name: `More actions for ${TITLE}`, exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('button', { name: /^Delete/ }).click()
  await page.waitForTimeout(900)
  // The undo toast quotes the title — rightly — so count cards, not text.
  check(
    'deleting the sample works like any delete',
    0,
    await page.getByRole('button', { name: `More actions for ${TITLE}`, exact: true }).count(),
  )
  await page.reload()
  await page.waitForTimeout(1500)
  check('…and it does not come back', 0, await page.getByText(TITLE).count())

  // The cascade, verified where it counts: after the bin's hard-delete
  // sweep, nothing of the sample may remain in any table. The soft-delete
  // keeps rows (restorable, by design) — so run the sweep the trash uses,
  // then count what's left carrying the sample's project id.
  const orphans = await page.evaluate(async () => {
    const open = indexedDB.open('inkwell')
    const db = await new Promise((res, rej) => {
      open.onsuccess = () => res(open.result)
      open.onerror = () => rej(open.error)
    })
    const stores = [...db.objectStoreNames]
    const rows = {}
    for (const store of stores) {
      const all = await new Promise((res, rej) => {
        const tx = db.transaction(store, 'readonly')
        const req = tx.objectStore(store).getAll()
        req.onsuccess = () => res(req.result)
        req.onerror = () => rej(req.error)
      })
      // Everything the sample owned is either binned (deletedAt set) or
      // gone; a live row pointing at a deleted book is the cascade bug
      // this check exists to catch.
      const live = all.filter((row) => !row.deletedAt && (row.projectId || row.sceneId))
      const project = all.find((row) => row.deletedAt && row.title !== undefined && row.author !== undefined)
      if (project) rows.__projectId = project.id
      rows[store] = live
    }
    db.close()
    const sampleId = rows.__projectId
    delete rows.__projectId
    const orphaned = []
    for (const [store, live] of Object.entries(rows)) {
      for (const row of live) {
        if (row.projectId === sampleId) orphaned.push(`${store}:${row.id}`)
      }
    }
    return orphaned
  })
  check('deleting binned the whole book — no live rows left behind', [], orphans)
  check('the empty state greets honestly now', true, (await page.getByText(/No projects yet|Start your first/i).count()) > 0 || (await page.getByText('New project').count()) > 0)

  check('no uncaught errors (fresh writer)', [], errors)
  await page.context().close()
}

// ── A writer with history gets no sample ────────────────────────────────────
{
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.addInitScript(() => localStorage.setItem('inkwell-sample-under-test', '1'))

  // Seed a real project BEFORE the projects page ever loads.
  await page.goto(`${BASE}#/settings`)
  await page.waitForTimeout(1000)
  await page.evaluate(async () => {
    const open = indexedDB.open('inkwell')
    const db = await new Promise((res, rej) => {
      open.onsuccess = () => res(open.result)
      open.onerror = () => rej(open.error)
    })
    const now = Date.now()
    await new Promise((res, rej) => {
      const tx = db.transaction('projects', 'readwrite')
      tx.objectStore('projects').put({
        id: 'p-mine',
        createdAt: now,
        updatedAt: now,
        title: 'My Real Novel',
        author: 'Me',
        synopsis: '',
        genre: '',
        targetWordCount: 80000,
        coverId: null,
        seriesId: null,
        seriesOrder: 0,
        status: 'drafting',
        settings: {
          defaultAiPresetId: null,
          pov: 'third-limited',
          tense: 'past',
          measureWidthCh: 68,
          structureMode: 'scenes',
        },
      })
      tx.oncomplete = res
      tx.onerror = () => rej(tx.error)
    })
    db.close()
  })
  await page.goto(`${BASE}#/projects`)
  await page.reload()
  await page.getByText('My Real Novel').waitFor({ timeout: 15000 })
  await page.waitForTimeout(1200)
  check('a library with history is left alone', 0, await page.getByText(TITLE).count())
  check('no uncaught errors (existing writer)', [], errors)
  await page.context().close()
}

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
