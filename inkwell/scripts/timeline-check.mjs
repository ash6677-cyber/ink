/**
 * Story timeline, proven live: Planning has a Timeline tab that arranges
 * scenes on a when-it-happens axis. Scenes carry an optional story-day; the
 * tab groups them by day ascending, gathers undated scenes at the end, and
 * warns when reading order runs ahead of story time (a later scene set on an
 * earlier day — the "funeral before the death" tell).
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/timeline-check.mjs
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
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Timeline Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  // Reading order: ch1 day1, ch2 day5, ch3 day2 (a jump back → reversal),
  // plus a fourth chapter whose scene has no story-day (undated section).
  const scenes = [
    { chapter: 'The Departure', title: 'Setting out', day: 1 },
    { chapter: 'The Peak', title: 'At the summit', day: 5 },
    { chapter: 'The Flashback', title: 'Years before', day: 2 },
    { chapter: 'The Fragment', title: 'Unplaced scene', day: null },
  ]
  let c = 0
  for (const sc of scenes) {
    const cid = id('ch')
    await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: sc.chapter, order: c, status: 'drafting' })
    const t = `${sc.title}. The road went on.`
    const scene = { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: sc.title, order: 0, content: doc(t), plainText: t, wordCount: t.split(/\s+/).length, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] }
    if (sc.day !== null) scene.storyDay = sc.day
    await put('scenes', scene)
    c++
  }
  db.close()
  return { pid }
})

await page.goto(`${BASE}#/planning?project=${ids.pid}`)
await eventually(async () => (await page.getByRole('tab', { name: 'Timeline' }).count()) > 0)
check('the Timeline tab is present on Planning', true, true)

await page.getByRole('tab', { name: 'Timeline' }).click()
await page.waitForTimeout(500)

// Day headings, in the order they render top-to-bottom.
const dayHeads = await eventually(async () => {
  const t = await page.locator('h3').allTextContents()
  const days = t.filter((x) => /^Day /.test(x.trim()))
  return days.length >= 3 ? days.map((x) => x.trim()) : false
})
check('story-days render in ascending order', ['Day 1', 'Day 2', 'Day 5'], dayHeads)

check(
  'a reversal warning is shown (reading order runs ahead of story time)',
  true,
  (await page.getByText(/Reading order runs out of step/).count()) > 0,
)

check(
  'the summit scene sits under its story-day',
  true,
  (await page.getByText('At the summit').count()) > 0,
)

check(
  'the undated section gathers scenes with no story day',
  true,
  (await page.getByText('No story day yet').count()) > 0,
)
check(
  'the unplaced scene appears in the undated section',
  true,
  (await page.getByText('Unplaced scene').count()) > 0,
)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
