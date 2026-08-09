/**
 * Relationship map, proven live: the Almanac's Map view must draw a node
 * per connected entry, a labelled line per relationship, and open an entry
 * when its node is clicked.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/relationship-map-check.mjs
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
const pid = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Cast Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const marta = id('c'); const tom = id('c'); const lone = id('c')
  const entry = (eid, name, rels) => ({ id: eid, createdAt: now, updatedAt: now, projectId: pid, seriesId: null, type: 'character', name, aliases: [], summary: '', body: null, plainText: '', attributes: [], relationships: rels, imageId: null, tags: [], aiContext: 'auto', aiContextTokenBudget: null })
  await put('codexEntries', entry(marta, 'Marta', [{ id: 'r1', targetEntryId: tom, label: 'mother of' }]))
  await put('codexEntries', entry(tom, 'Tom', []))
  await put('codexEntries', entry(lone, 'Hermit', [])) // unconnected — must not appear on the map
  db.close()
  return pid
})

await page.goto(`${BASE}#/almanac?project=${pid}`)
await eventually(async () => (await page.getByRole('button', { name: 'Map' }).count()) > 0)
await page.getByRole('button', { name: 'Map' }).click()
await eventually(async () => (await page.locator('svg[aria-label*="Relationship map"]').count()) > 0)

const nodeTexts = await page.locator('svg g[transform] text').allTextContents()
check('the two connected entries are drawn as nodes', ['Marta', 'Tom'], [...nodeTexts].sort())
check('the unconnected entry is left off the map', false, nodeTexts.includes('Hermit'))
check('the relationship label is drawn on the edge', true, (await page.getByText('mother of').count()) > 0)

// Clicking a node opens that entry.
await page.locator('svg g[transform]', { hasText: 'Tom' }).click()
const opened = await eventually(async () => new URL(page.url()).hash.includes('/almanac/'))
check('clicking a node opens its entry', true, opened && !new URL(page.url()).hash.endsWith('/almanac'))

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
