/**
 * Character interview mode, proven live: Scene details offers "Discuss
 * with <character>" (POV ranked first), one tap creates an interview chat
 * in the Playground with a "Discussing" banner, the scene's prose rides in
 * the prompt (visible in the context preview AND in the request the mock
 * provider receives), and the character's streamed reply lands.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/scene-interview-check.mjs
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

// The mock provider: streams a reply and records what it was asked.
const requests = []
await page.route('**/mock-ai/**', async (route) => {
  const body = route.request().postDataJSON()
  requests.push(body)
  const reply = 'I remember the water was higher than anyone admitted.'
  const frames = [...reply].map(
    (ch) => `data: ${JSON.stringify({ choices: [{ delta: { content: ch } }] })}\n\n`,
  )
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: frames.join('') + 'data: [DONE]\n\n',
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
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Interview Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const cid = id('ch')
  await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: 'Chapter 1', order: 0, status: 'drafting' })
  const codexMarta = id('codex')
  await put('codexEntries', { id: codexMarta, createdAt: now, updatedAt: now, projectId: pid, seriesId: null, type: 'character', name: 'Marta', aliases: [], summary: '', body: null, plainText: '', attributes: [], relationships: [], imageId: null, tags: [], aiContext: 'auto', aiContextTokenBudget: null })
  const text = 'Marta waded into the ford at dusk. Tomas watched from the bank, saying nothing about the rope.'
  const sceneId = id('sc')
  await put('scenes', { id: sceneId, createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: 'The ford', order: 0, content: doc(text), plainText: text, wordCount: 17, status: 'drafting', povCharacterId: codexMarta, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
  // Two cards: Marta linked to the POV codex entry; Tomas merely named.
  await put('characterCards', { id: id('card'), createdAt: now, updatedAt: now, projectId: pid, codexEntryId: codexMarta, displayName: 'Marta', avatarImageId: null, cropSettings: null, description: 'Ferrywoman.', personality: 'Wry.', scenario: '', firstMessage: '', exampleDialogue: [], systemPromptOverride: null, voiceNotes: '', tags: [] })
  await put('characterCards', { id: id('card'), createdAt: now, updatedAt: now, projectId: pid, codexEntryId: null, displayName: 'Tomas', avatarImageId: null, cropSettings: null, description: '', personality: '', scenario: '', firstMessage: '', exampleDialogue: [], systemPromptOverride: null, voiceNotes: '', tags: [] })
  // Mock AI provider + default preset.
  const provId = id('prov')
  await put('aiProviders', { id: provId, createdAt: now, updatedAt: now, name: 'Mock', kind: 'openai-compatible', apiKey: 'sk-mock', baseUrl: 'http://127.0.0.1:5410/mock-ai/v1', defaultModel: 'mock-model' })
  await put('aiPresets', { id: id('preset'), createdAt: now, updatedAt: now, name: 'Default', providerId: provId, model: 'mock-model', temperature: 0.7, topP: 1, systemPrompt: '', proseInstructions: '', contextRules: { precedingParagraphs: 3, includeCodex: false, codexTokenBudget: 0, includeLorebook: false, lorebookTokenBudget: 0 }, isDefault: true })
  db.close()
  return { pid }
})

// ---- Editor → Scene details → Talk it over. ----
await page.goto(`${BASE}#/editor?project=${ids.pid}`)
await eventually(async () => (await page.getByText('The ford').count()) > 0)
const detailsOpen = await eventually(async () => (await page.locator('[data-discuss-scene]').count()) > 0)
if (!detailsOpen) {
  await page.getByRole('button', { name: /Scene details/i }).click()
  await eventually(async () => (await page.locator('[data-discuss-scene]').count()) > 0)
}
check('the Talk it over section appears', true, (await page.locator('[data-discuss-scene]').count()) > 0)
check(
  'Marta is offered first, as the POV of the scene',
  true,
  (await page.getByText('POV of this scene').count()) > 0,
)
check(
  'Tomas is offered too, named in the prose',
  true,
  (await page.getByText('Named in this scene').count()) > 0,
)

const buttons = page.locator('[data-discuss-scene] button')
check(
  'POV outranks a mere mention',
  true,
  /Marta/.test((await buttons.first().innerText())),
)

await buttons.first().click()
await eventually(async () => (await page.locator('[data-discussing-banner]').count()) > 0)
check('the chat opens with a Discussing banner naming the scene', true,
  /The ford/.test(await page.locator('[data-discussing-banner]').innerText()))
check('the chat is titled after the scene', true,
  (await page.getByText('Discussing “The ford”').count()) > 0)

// ---- Ask a question; the mock character answers from the scene. ----
await page.getByRole('textbox').last().fill('Why did no one mention the rope?')
await page.keyboard.press('Enter')
const replied = await eventually(
  async () => (await page.getByText('I remember the water was higher').count()) > 0,
  20000,
)
check('the character replies (streamed through the mock provider)', true, replied)

check('one request reached the provider', 1, requests.length)
const system = requests[0]?.messages?.find((m) => m.role === 'system')?.content ?? ''
check(
  'the scene’s prose rode along in the system prompt',
  true,
  system.includes('saying nothing about the rope'),
)
check(
  'the prompt names the scene under discussion',
  true,
  system.includes('“The ford”') || system.includes('"The ford"'),
)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
