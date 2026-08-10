/**
 * Which key runs each feature, proven live: two providers with different
 * endpoints; the proofread pass is pinned to Key A and character chat to
 * Key B, and each request verifiably lands on its assigned endpoint —
 * then the Settings switch moves proofread to Key B and the very next
 * request follows it. The answer really does come from the key you chose.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/feature-keys-check.mjs
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
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

// Two "AIs" at two addresses. Each records what it was asked and answers
// with its own name, so the reply itself says which key served it.
const hits = { a: [], b: [] }
const sse = (text) =>
  [...text].map((ch) => `data: ${JSON.stringify({ choices: [{ delta: { content: ch } }] })}\n\n`).join('') +
  'data: [DONE]\n\n'
await page.route('**/key-a/**', async (route) => {
  hits.a.push(route.request().url())
  await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse('[]') })
})
await page.route('**/key-b/**', async (route) => {
  hits.b.push(route.request().url())
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: sse('Answered by Key B.'),
  })
})

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(700)
const ids = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Keyed Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const cid = id('ch')
  await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: 'Chapter 1', order: 0, status: 'drafting' })
  const text = 'Marta walked teh long road home.'
  await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: 'Scene 1', order: 0, content: doc(text), plainText: text, wordCount: 7, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
  await put('characterCards', { id: id('card'), createdAt: now, updatedAt: now, projectId: pid, codexEntryId: null, displayName: 'Marta', avatarImageId: null, cropSettings: null, description: 'Walker.', personality: '', scenario: '', firstMessage: '', exampleDialogue: [], systemPromptOverride: null, voiceNotes: '', tags: [] })
  const provA = id('prov')
  const provB = id('prov')
  await put('aiProviders', { id: provA, createdAt: now, updatedAt: now, name: 'Key A', label: 'Key A', kind: 'openai-compatible', apiKey: 'sk-a', baseUrl: 'http://127.0.0.1:5410/key-a/v1', defaultModel: 'model-a', enabled: true })
  await put('aiProviders', { id: provB, createdAt: now, updatedAt: now, name: 'Key B', label: 'Key B', kind: 'openai-compatible', apiKey: 'sk-b', baseUrl: 'http://127.0.0.1:5410/key-b/v1', defaultModel: 'model-b', enabled: true })
  await put('aiPresets', { id: id('preset'), createdAt: now, updatedAt: now, name: 'Default', providerId: null, model: '', temperature: 0.2, topP: 1, systemPrompt: '', proseInstructions: '', contextRules: { precedingParagraphs: 3, includeCodex: false, codexTokenBudget: 0, includeLorebook: false, lorebookTokenBudget: 0 }, isDefault: true })
  // The writer's per-feature key map: proofread on A, chat on B.
  const prefs = JSON.parse(localStorage.getItem('inkwell-preferences') ?? '{"state":{},"version":0}')
  prefs.state.featureProviders = { proofread: provA, chat: provB }
  localStorage.setItem('inkwell-preferences', JSON.stringify(prefs))
  return { pid, provA, provB }
})
await page.reload()
await page.waitForTimeout(900)

// ---- Proofread must hit Key A. ----
await page.goto(`${BASE}#/editor?project=${ids.pid}`)
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Proofread scene' }).click()
await eventually(async () => (await page.getByRole('heading', { name: 'Proofread this scene' }).count()) > 0)
await page.getByRole('button', { name: 'Proofread', exact: true }).click()
await eventually(async () => hits.a.length > 0)
check('the proofread request went to Key A', 1, hits.a.length)
check('…and only Key A', 0, hits.b.length)

// ---- Chat must hit Key B, and the reply says so. ----
await page.goto(`${BASE}#/playground/cards?project=${ids.pid}`)
await page.waitForTimeout(900)
// Into the card's own page, whose Chat button opens (or resumes) the talk.
await page.getByRole('button', { name: 'Marta' }).first().click()
await eventually(async () => (await page.getByRole('button', { name: /Chat/ }).count()) > 0)
await page.getByRole('button', { name: /Chat/ }).first().click()
await eventually(async () => (await page.getByRole('textbox').count()) > 0)
await page.getByRole('textbox').last().fill('Where does the road end?')
await page.keyboard.press('Enter')
const replied = await eventually(async () => (await page.getByText('Answered by Key B.').count()) > 0)
check('the chat reply came from Key B — the key you picked answers', true, replied)
check('exactly one chat request, on Key B', 1, hits.b.length)
check('Key A saw nothing from the chat', 1, hits.a.length)

// ---- The Settings switch: move proofread to Key B; the next run follows. ----
await page.goto(`${BASE}#/settings`)
await page.waitForTimeout(600)
const keysSection = await eventually(async () => (await page.getByText('Which key runs each feature').count()) > 0)
check('Settings shows the key-per-feature section', true, keysSection)
await page.getByLabel('Key for Proofread pass').click()
await page.getByRole('option', { name: 'Key B' }).click()
await page.waitForTimeout(300)

await page.goto(`${BASE}#/editor?project=${ids.pid}`)
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Proofread scene' }).click()
await eventually(async () => (await page.getByRole('heading', { name: 'Proofread this scene' }).count()) > 0)
const bBefore = hits.b.length
await page.getByRole('button', { name: 'Proofread', exact: true }).click()
await eventually(async () => hits.b.length > bBefore)
check('after the switch, proofread follows to Key B', true, hits.b.length > bBefore)
check('Key A gained nothing more', 1, hits.a.length)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
