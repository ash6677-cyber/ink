/**
 * Library-wide search, proven live: one palette over everything. A seeded
 * project hides a distinct phrase in each kind of record — an Almanac
 * entry's body, a character's sheet, a chat transcript, a promise's note,
 * a submission's notes — none of them in any title. Typing each phrase
 * surfaces it under "In the library" with the right record named, and
 * choosing a result lands on the right page (the promise lands on the
 * Promises board via the new ?view= param). Prose search still works
 * beside it, and gibberish is answered honestly with nothing.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/library-search-check.mjs
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
const eventually = async (p, t = 20000) => {
  const d = Date.now() + t
  for (;;) {
    const v = await p()
    if (v) return v
    if (Date.now() > d) return false
    await new Promise((r) => setTimeout(r, 300))
  }
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(800)
const ids = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Memory Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const cid = id('ch')
  await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: 'Chapter 1', order: 0, status: 'drafting' })
  const sid = id('sc')
  await put('scenes', { id: sid, createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: 'Opening', order: 0, content: doc('The salt road ran north through the fen.'), plainText: 'The salt road ran north through the fen.', wordCount: 8, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })

  const marta = id('cx')
  await put('codexEntries', { id: marta, createdAt: now, updatedAt: now, projectId: pid, seriesId: null, type: 'character', name: 'Marta', aliases: [], summary: '', body: null, plainText: 'She fears the copperwing moths above all.', attributes: [{ id: id('a'), key: 'Fear', value: 'heights' }], relationships: [], imageId: null, tags: [], aiContext: 'when-relevant', aiContextTokenBudget: null })
  const cardId = id('card')
  await put('characterCards', { id: cardId, createdAt: now, updatedAt: now, projectId: pid, codexEntryId: null, displayName: 'Bram', avatarImageId: null, cropSettings: null, description: 'Keeps a tally of glassblower debts.', personality: '', scenario: '', firstMessage: '', exampleDialogue: [], systemPromptOverride: null, voiceNotes: '', tags: [] })
  await put('cardChats', { id: id('chat'), createdAt: now, updatedAt: now, cardId, projectId: pid, mode: 'in-world', title: 'First talk', personaId: null, aiPresetId: null, messages: [{ id: id('m'), role: 'assistant', content: 'I remember the drowned bell tolling.', createdAt: now }] })
  await put('promises', { id: id('pr'), createdAt: now, updatedAt: now, projectId: pid, title: 'The locket', quote: '', note: 'Pays off at the winter fair.', setupSceneId: sid, payoffSceneId: null })
  await put('submissions', { id: id('sub'), createdAt: now, updatedAt: now, projectId: pid, market: 'Harbour Literary', contact: '', status: 'queried', sentAt: now, respondBy: null, notes: 'Wants the pelican chapters expanded.' })
  db.close()
  return { pid, marta }
})

// Open the editor so the project is the palette's scope.
await page.goto(`${BASE}#/editor?project=${ids.pid}`)
await eventually(async () => (await page.getByText('Opening').count()) > 0)

const searchFor = async (text) => {
  await page.keyboard.press('Control+k')
  await eventually(async () => (await page.getByPlaceholder(/Search your book/).count()) > 0)
  await page.getByPlaceholder(/Search your book/).fill(text)
  await page.waitForTimeout(400)
}
const paletteText = () => page.getByRole('dialog').innerText()
const closePalette = () => page.keyboard.press('Escape')

// ---- Every kind of record is findable by its CONTENT. ----
await searchFor('copperwing moths')
check('an Almanac body is findable', true, /IN THE LIBRARY[\s\S]*copperwing moths[\s\S]*Marta/i.test(await paletteText()))
await closePalette()

await searchFor('glassblower debts')
check('a character sheet is findable', true, /glassblower debts[\s\S]*Bram/.test(await paletteText()))
await closePalette()

await searchFor('drowned bell')
check('a chat transcript is findable', true, /drowned bell[\s\S]*First talk/.test(await paletteText()))
await closePalette()

await searchFor('winter fair')
check('a promise note is findable', true, /winter fair[\s\S]*The locket/.test(await paletteText()))
await closePalette()

await searchFor('pelican chapters')
check('a submission note is findable', true, /pelican chapters[\s\S]*Harbour Literary/.test(await paletteText()))
await closePalette()

// ---- Prose search still stands beside it. ----
await searchFor('salt road')
check('prose search still answers beside the library', true,
  /IN THE PROSE[\s\S]*salt road/i.test(await paletteText()))
await closePalette()

// ---- A result is a door: the promise lands on the Promises board. ----
await searchFor('winter fair')
await page.getByRole('dialog').getByRole('button', { name: /winter fair/ }).click()
const landed = await eventually(async () =>
  page.url().includes('view=promises') &&
  (await page.locator('[data-promises]').count().catch(() => 0)) > 0)
check('choosing the promise lands on the Promises board', true, landed)

// ---- Honesty about nothing. ----
await searchFor('zyxwv qqq')
check('gibberish is answered with nothing, not noise', true,
  /No results/.test(await paletteText()))
await closePalette()

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
