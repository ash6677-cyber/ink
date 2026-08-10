/**
 * "Today I wrote" digest, proven live: the Stats page carries a Today card
 * that gathers the day — words and sittings from session logs, scenes
 * touched from their timestamps, best sprint from the sprint log — and
 * stays honestly quiet on an empty day.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/today-digest-check.mjs
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

// ---- Empty day first: the card must exist and stay quiet. ----
await page.goto(`${BASE}#/stats`)
await eventually(async () => (await page.locator('[data-today-digest]').count()) > 0)
check('the Today card is on the Stats page', true, true)
check(
  'an empty day reads as patience, not zeros',
  true,
  (await page.getByText('Nothing yet today. The page is patient.').count()) > 0,
)

// ---- Seed a real day: sessions, touched scenes, a sprint log. ----
await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(600)
const ids = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Digest Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const cid = id('ch')
  await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: 'Chapter 1', order: 0, status: 'drafting' })
  // Two scenes touched today (updatedAt now), one stale from three days ago.
  const stale = now - 3 * 24 * 60 * 60 * 1000
  const mk = (title, updatedAt, order) => ({ id: id('sc'), createdAt: stale, updatedAt, chapterId: cid, projectId: pid, title, order, content: doc(title), plainText: title, wordCount: 50, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
  await put('scenes', mk('The Morning Pages', now - 60_000, 0))
  await put('scenes', mk('The Evening Fix', now - 30_000, 1))
  await put('scenes', mk('Old Draft Left Alone', stale, 2))
  // Two sittings pinned INSIDE today whatever the wall clock says — the
  // harness may run minutes after midnight, when "six hours ago" is
  // yesterday and would rightly be excluded.
  const dayStart = (() => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime() })()
  const s1Start = dayStart
  const s1End = Math.min(dayStart + 40 * 60000, now)
  const s2Start = Math.max(dayStart, now - 5 * 60000)
  const s2End = now
  const mins = (a, b) => Math.max(1, Math.round((b - a) / 60000))
  const expectedMinutes = mins(s1Start, s1End) + mins(s2Start, s2End)
  await put('sessionLogs', { id: id('sess'), createdAt: s1Start, updatedAt: s1End, projectId: pid, wordsWritten: 800, startedAt: s1Start, endedAt: s1End })
  await put('sessionLogs', { id: id('sess'), createdAt: s2End, updatedAt: s2End, projectId: pid, wordsWritten: 150, startedAt: s2Start, endedAt: s2End })
  db.close()
  // Sprint log: both entries pinned inside today too; 412 must win.
  localStorage.setItem('inkwell-sprint-log', JSON.stringify([
    { words: 180, minutes: 15, endedAt: Math.max(dayStart, now - 3 * 60 * 60 * 1000), projectId: pid },
    { words: 412, minutes: 25, endedAt: Math.max(dayStart, now - 60 * 60 * 1000), projectId: pid },
  ]))
  return { pid, expectedMinutes }
})

await page.goto(`${BASE}#/stats?project=${ids.pid}`)
await page.reload()
await eventually(async () => (await page.locator('[data-today-digest]').count()) > 0)

check(
  'the day’s words are gathered (800 + 150)',
  true,
  (await page.locator('[data-today-digest]').getByText('950').count()) > 0,
)
check(
  'time at the desk sums the sittings',
  true,
  (await page.getByText(`${ids.expectedMinutes} min across 2 sittings`).count()) > 0,
  `expected ${ids.expectedMinutes} min`,
)
check(
  'the best sprint of the day is named',
  true,
  (await page.getByText('Best sprint: 412 words in 25 min').count()) > 0,
)
check(
  'today’s touched scenes appear',
  true,
  (await page.getByText('The Evening Fix').count()) > 0 &&
    (await page.getByText('The Morning Pages').count()) > 0,
)
check(
  'a scene left alone for days stays out of the digest',
  0,
  await page.locator('[data-today-digest]').getByText('Old Draft Left Alone').count(),
)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
