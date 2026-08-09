/**
 * The AI proofread pass, proven end to end with a fake provider.
 *
 * No real key, no real network: an OpenAI-compatible provider is seeded
 * pointing at a URL Playwright intercepts, and the mock streams back a
 * proofread JSON reply as Server-Sent Events — exactly the shape the real
 * adapter parses. The test then drives the whole loop: run the pass, see
 * the accept/reject cards, accept one and confirm the manuscript changed,
 * reject one and confirm it did not, and prove a hallucinated fix (text
 * not in the scene) never reaches the writer.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/proofread-check.mjs
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
    await new Promise((r) => setTimeout(r, 250))
  }
}

const SCENE_TEXT =
  'She walked to the the door and opened it. The room was quiet, very quiet indeed.'

// What the fake model "returns": one real doubled-word fix, one echo fix,
// and one hallucination whose original never appears — the app must keep
// the first two and silently drop the third.
const MODEL_JSON = JSON.stringify([
  { category: 'repeat', original: 'the the door', suggestion: 'the door', explanation: 'Doubled "the".' },
  { category: 'echo', original: 'very quiet indeed', suggestion: 'perfectly still', explanation: 'Echo of "quiet".' },
  { category: 'typo', original: 'a phrase not in the scene', suggestion: 'x', explanation: 'Hallucinated.' },
])

function sseBody(text) {
  // One token per SSE frame, then [DONE] — the shape parseSSE expects.
  const frames = [...text].map(
    (ch) => `data: ${JSON.stringify({ choices: [{ delta: { content: ch } }] })}\n\n`,
  )
  return frames.join('') + 'data: [DONE]\n\n'
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

// Intercept the model call and stream the fake reply.
let modelCalled = false
await page.route('**/mock-ai/**', async (route) => {
  modelCalled = true
  await route.fulfill({
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
    body: sseBody(MODEL_JSON),
  })
})

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(900)
const projectId = await page.evaluate(async (sceneText) => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Proof Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const cid = id('ch')
  await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: 'Chapter 1', order: 0, status: 'draft' })
  await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: 'Scene 1', order: 0, content: doc(sceneText), plainText: sceneText, wordCount: sceneText.split(/\s+/).length, status: 'draft', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
  // A fake OpenAI-compatible provider whose baseUrl the test intercepts.
  const provId = id('prov')
  await put('aiProviders', { id: provId, createdAt: now, updatedAt: now, name: 'Mock', kind: 'openai-compatible', apiKey: 'sk-mock', baseUrl: 'http://127.0.0.1:5410/mock-ai/v1', defaultModel: 'mock-model' })
  await put('aiPresets', { id: id('preset'), createdAt: now, updatedAt: now, name: 'Default', providerId: provId, model: 'mock-model', temperature: 0.7, topP: 1, systemPrompt: '', proseInstructions: '', contextRules: { precedingParagraphs: 3, includeCodex: false, codexTokenBudget: 0, includeLorebook: false, lorebookTokenBudget: 0 }, isDefault: true })
  db.close()
  return pid
}, SCENE_TEXT)

await page.goto(`${BASE}#/editor?project=${projectId}`)
await page.waitForTimeout(1600)

await page.getByRole('button', { name: 'Proofread scene' }).click()
await eventually(async () => (await page.getByRole('heading', { name: 'Proofread this scene' }).count()) > 0)
await page.getByRole('button', { name: 'Proofread', exact: true }).click()

const cardsUp = await eventually(async () => (await page.getByText('Doubled "the".').count()) > 0)
check('the proofread pass returns suggestion cards', true, cardsUp)
check('the fake model was actually called', true, modelCalled)

// The hallucinated fix must never have been shown.
check(
  'a fix whose text is not in the scene is dropped',
  0,
  await page.getByText('Hallucinated.').count(),
)
check('exactly the two applicable fixes are offered', 2, await page.getByText(/Doubled|Echo of/).count())

// Accept the doubled-word fix; the manuscript must change.
await page.getByLabel('Accept this fix').first().click()
await page.waitForTimeout(2500)
const afterAccept = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const scenes = await new Promise((res) => {
    const out = []
    const cur = db.transaction('scenes', 'readonly').objectStore('scenes').openCursor()
    cur.onsuccess = (e) => { const c = e.target.result; if (c) { out.push(c.value); c.continue() } else res(out) }
  })
  db.close()
  return scenes[0].plainText
})
check('accepting a fix rewrites the manuscript', true, !afterAccept.includes('the the door'), afterAccept)
check('…and the accepted card leaves the list', 0, await page.getByText('Doubled "the".').count())

// Reject the remaining fix; the manuscript must NOT change further.
await page.getByLabel('Dismiss this fix').first().click()
await page.waitForTimeout(400)
const afterReject = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const scenes = await new Promise((res) => {
    const out = []
    const cur = db.transaction('scenes', 'readonly').objectStore('scenes').openCursor()
    cur.onsuccess = (e) => { const c = e.target.result; if (c) { out.push(c.value); c.continue() } else res(out) }
  })
  db.close()
  return scenes[0].plainText
})
check('rejecting a fix leaves the prose untouched', true, afterReject.includes('very quiet indeed'))
check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
