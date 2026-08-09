/**
 * Projections and sprints, through the real UI.
 *
 *   - The Finishing card projects from the writer's honest two-week pace,
 *     and a deadline gets a required-pace verdict that tells the truth.
 *   - A sprint counts net words against the clock, ends on demand, and
 *     reports goal-met from what was actually typed.
 *
 *   INKWELL_BASE_PATH=/ npm run build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/momentum-check.mjs
 */
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? '/opt/node22/lib/node_modules/playwright/index.mjs'
)
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5410/'
const DAY = 24 * 60 * 60 * 1000

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
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

await page.goto(`${BASE}#/projects`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)

const { projectId } = await page.evaluate(async (DAY_MS) => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((res, rej) => {
    open.onsuccess = () => res(open.result)
    open.onerror = () => rej(open.error)
  })
  const now = Date.now()
  const id = (p) => `${p}-${Math.random().toString(36).slice(2, 10)}`
  const put = (store, value) =>
    new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).put(value)
      tx.oncomplete = () => res(value)
      tx.onerror = () => rej(tx.error)
    })
  const projectId = id('p')
  await put('projects', {
    id: projectId, createdAt: now, updatedAt: now, title: 'The Tide Ledger', author: '',
    synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null,
    seriesOrder: 0, status: 'drafting',
    settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' },
  })
  const chapterId = id('c')
  await put('chapters', { id: chapterId, createdAt: now, updatedAt: now, projectId, title: 'Chapter 1', order: 0, status: 'drafting' })
  // Scene 1 is where the sprint types — its stored count matches its text,
  // because the editor recounts honestly on the first keystroke. Scene 2 is
  // untouched ballast carrying the manuscript's bulk for the projections.
  const scene = (order, title, text, words) => ({
    id: id('s'), createdAt: now, updatedAt: now, projectId, chapterId, title, order,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
    plainText: text, wordCount: words, status: 'drafting', povCharacterId: null,
    locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [],
  })
  await put('scenes', scene(0, 'Harbour Morning', 'The tide came in.', 4))
  await put('scenes', scene(1, 'Ballast', 'Elsewhere.', 29996))
  // Fourteen days of 500-a-day history, mid-morning stamps.
  for (let d = 0; d < 14; d++) {
    const startedAt = now - d * DAY_MS
    await put('sessionLogs', {
      id: id('log'), createdAt: startedAt, updatedAt: startedAt, projectId,
      wordsWritten: 500, startedAt, endedAt: startedAt + 30 * 60 * 1000,
    })
  }
  db.close()
  return { projectId }
}, DAY)

// ── The Finishing card, projected from honest pace ──────────────────────────
await page.goto(`${BASE}#/stats?project=${projectId}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)

check('the Finishing card is on the scoped Stats page', true, (await page.getByText('Finishing').count()) > 0)
const cardText = await page.locator('text=At your two-week pace').textContent().catch(() => '')
check('…projecting from the two-week pace', true, cardText.includes('words a day, quiet days included'))
check(
  '…with roughly the right pace (≈500/day of seeded history)',
  true,
  /\b(4[5-9]\d|5[0-4]\d)\b/.test(cardText),
  cardText.slice(0, 90),
)

// A deadline 50,000 words can't meet at 500/day: 40 days out needs 1,250.
const deadlineDate = new Date(Date.now() + 40 * DAY).toISOString().slice(0, 10)
await page.locator('#book-deadline').fill(deadlineDate)
await page.waitForTimeout(800)
const verdict = await page.getByText(/Needs [\d,]+ words a day/).textContent()
check('a deadline produces a required pace', true, /Needs 1,2\d\d words a day for \d+ days/.test(verdict), verdict)
check('…and admits the current pace falls short', true, /your pace is/.test(verdict))

// …and it persisted to the goal record.
const storedDeadline = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((res, rej) => {
    open.onsuccess = () => res(open.result)
    open.onerror = () => rej(open.error)
  })
  const goals = await new Promise((res, rej) => {
    const tx = db.transaction('goals', 'readonly')
    const req = tx.objectStore('goals').getAll()
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
  db.close()
  return goals.some((g) => typeof g.deadline === 'number' && g.deadline > Date.now())
})
check('the deadline persisted onto the goal record', true, storedDeadline)

// ── A sprint, started, typed through, ended ────────────────────────────────
await page.goto(`${BASE}#/editor?project=${projectId}`, { waitUntil: 'domcontentloaded' })
await page.locator('.editor-prose').first().waitFor({ timeout: 15000 })

await page.getByRole('button', { name: 'Start a writing sprint' }).click()
await page.getByLabel('Sprint minutes').fill('1')
await page.getByLabel('Word goal (optional)').fill('5')
await page.getByRole('button', { name: 'Start sprint' }).click()
await page.waitForTimeout(400)

check('the sprint chip appears with a ticking clock', true, (await page.getByLabel('Sprint time remaining').count()) > 0)
const clock = await page.getByLabel('Sprint time remaining').textContent()
check('…counting down from one minute', true, /^(1:0[01]|0:[45]\d)$/.test(clock), clock)

await page.locator('.editor-prose').click()
await page.keyboard.press('End')
await page.keyboard.type(' The keeper counted every lamp along the pier tonight.')
// Autosave writes the word count the chip reads.
await page.waitForTimeout(2000)
const chipText = await page.locator('div', { has: page.getByLabel('Sprint time remaining') }).last().textContent()
check('the chip counts the words typed during the sprint', true, /\+9 \/ 5 words/.test(chipText), chipText)

await page.getByRole('button', { name: 'End the sprint now' }).click()
await page.waitForTimeout(400)
check('ending early reports the sprint honestly', true, (await page.getByText('Goal met.').count()) > 0)
check(
  '…with the words and the minute',
  true,
  (await page.getByText(/9 words in 1 minute — the goal was 5/).count()) > 0,
)
await page.getByRole('button', { name: 'Back to the page' }).click()
await page.waitForTimeout(300)
check('the sprint button returns for next time', true, (await page.getByRole('button', { name: 'Start a writing sprint' }).count()) > 0)

check('no uncaught errors anywhere along the way', [], pageErrors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
