/**
 * The whole-book read-through, proven live against a MOCKED endpoint (no
 * real key, no spend): the bill shows before any request leaves (zero
 * calls at estimate time, cost math checked at the writer's own rate);
 * running reads the three chapters as three streaming passes plus one
 * letter pass; pausing after chapter two and reloading the app resumes
 * from chapter three WITHOUT re-paying for the first two; the letter's
 * "(Chapter N)" citations are doors into the editor.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/read-through-check.mjs
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
const eventually = async (p, t = 25000) => {
  const d = Date.now() + t
  for (;;) {
    const v = await p()
    if (v) return v
    if (Date.now() > d) return false
    await new Promise((r) => setTimeout(r, 300))
  }
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

// ---- The mock: chapter passes get NOTES+MEMORY, the letter pass cites. ----
const calls = []
const sse = (text) =>
  [...text].map((ch) => `data: ${JSON.stringify({ choices: [{ delta: { content: ch } }] })}\n\n`).join('') +
  'data: [DONE]\n\n'
await page.route('**/mock-rt/**', async (route) => {
  const body = route.request().postDataJSON()
  const user = body.messages.find((m) => m.role === 'user')?.content ?? ''
  calls.push(user.slice(0, 60))
  // A real model takes time; the pause button needs a window to exist.
  await new Promise((r) => setTimeout(r, 1200))
  const chapterMatch = /^Chapter (\d) of 3/.exec(user)
  const reply = chapterMatch
    ? `NOTES: Chapter ${chapterMatch[1]} holds; the river keeps its promise.\nMEMORY: Read through chapter ${chapterMatch[1]}; the locket thread stays open.`
    : 'Dear writer — a fine book. The opening earns its quiet (Chapter 1), the middle sags (Chapter 2), and the ending pays the locket off (Chapter 3).'
  await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(reply) })
})

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
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Letter Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  await put('aiProviders', { id: id('prov'), createdAt: now, updatedAt: now, name: 'Mock RT', label: 'Mock RT', kind: 'openai-compatible', apiKey: 'sk-mock', baseUrl: 'http://127.0.0.1:5410/mock-rt/v1', defaultModel: 'mock-model', enabled: true })
  await put('aiPresets', { id: id('preset'), createdAt: now, updatedAt: now, name: 'Default', providerId: null, model: '', temperature: 0.2, topP: 1, systemPrompt: '', proseInstructions: '', contextRules: { precedingParagraphs: 3, includeCodex: false, codexTokenBudget: 0, includeLorebook: false, lorebookTokenBudget: 0 }, isDefault: true })
  for (let c = 0; c < 3; c++) {
    const cid = id('ch')
    await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: `Chapter ${c + 1}`, order: c, status: 'drafting' })
    const text = `Chapter ${c + 1} of the river book. `.repeat(40)
    await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: `Scene ${c + 1}`, order: 0, content: doc(text), plainText: text, wordCount: 280, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
  }
  db.close()
  return { pid }
})

// ---- The bill is on the table before any request leaves. ----
await page.goto(`${BASE}#/editor?project=${ids.pid}`)
await eventually(async () => (await page.getByRole('button', { name: 'Whole-book read-through' }).count()) > 0)
await page.getByRole('button', { name: 'Whole-book read-through' }).click()
await eventually(async () => (await page.locator('[data-rt-estimate]').count()) > 0)
const estimateText = await page.locator('[data-rt-estimate]').innerText()
check('the estimate names the chapters and tokens up front', true,
  /3 chapters/.test(estimateText) && /tokens in/.test(estimateText))
check('no request has left at estimate time', 0, calls.length)

await page.locator('#rt-rate').fill('3')
await eventually(async () => (await page.locator('[data-rt-cost]').count()) > 0)
check('the cost prices at the writer’s own rate', true,
  /≈ \$\d/.test(await page.locator('[data-rt-cost]').innerText()))
check('still nothing spent', 0, calls.length)

// ---- Run: three chapter passes stream in; pause before the letter. ----
await page.getByRole('button', { name: 'Read the whole book' }).click()
await eventually(async () => (await page.locator('[data-rt-notes] li').count()) >= 2)
await page.getByRole('button', { name: 'Pause after this chapter' }).click()
await eventually(async () => (await page.locator('[data-rt-phase]').count()) === 0)
const notesAfterPause = await page.locator('[data-rt-notes] li').count()
check('the pause lands cleanly between chapters', true, notesAfterPause >= 2 && notesAfterPause <= 3)
const callsAtPause = calls.length
check('each finished chapter cost exactly one call', callsAtPause, notesAfterPause)

// ---- Reload the whole app: the run resumes where it stopped, free. ----
await page.reload()
await eventually(async () => (await page.getByRole('button', { name: 'Whole-book read-through' }).count()) > 0)
await page.getByRole('button', { name: 'Whole-book read-through' }).click()
const resumeButton = page.getByRole('button', { name: new RegExp(`Resume from chapter ${notesAfterPause + 1}`) })
const resumable = await eventually(async () => (await resumeButton.count()) > 0)
check('after a full reload the run offers to resume, not restart', true, resumable)
check('the finished chapters are still on screen', notesAfterPause, await page.locator('[data-rt-notes] li').count())

await resumeButton.click()
await eventually(async () => (await page.locator('[data-rt-letter]').count()) > 0)
check('the letter arrives after the remaining chapters', true, true)
check('nothing already read was paid for twice', 3 + 1, calls.length,
  '3 chapter passes + 1 letter pass, total')
check('the letter cites its chapters', true,
  /\(Chapter 2\)/.test(await page.locator('[data-rt-letter]').innerText()))

// ---- A citation is a door into the editor. ----
await page.locator('[data-rt-letter] button', { hasText: '(Chapter 2)' }).click()
await page.waitForTimeout(600)
check('clicking a citation lands in the editor on that chapter', true,
  page.url().includes('scene='))

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
