/**
 * The dialogue pass, proven live: seed two chapters where Bram and Ana
 * trade tagged lines (plus one untagged shout) — the Dialogue tab reads
 * them out in order, credits each voice honestly, leaves the untagged
 * line unattributed, computes shares and pet words, filters to one voice
 * on click, runs the AI voice check against a MOCKED endpoint (no real
 * key, no spend) and shows its verdict, and clicking a line walks back
 * into the editor.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/dialogue-check.mjs
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

// ---- The mocked AI endpoint: a canned verdict, streamed as SSE. ----
const VERDICT = 'Bram holds a level, clipped register throughout; no line breaks the voice.'
const sse =
  [...VERDICT].map((ch) => `data: ${JSON.stringify({ choices: [{ delta: { content: ch } }] })}\n\n`).join('') +
  'data: [DONE]\n\n'
let aiCalls = 0
await page.route('**/mock-voice/**', async (route) => {
  aiCalls++
  await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse })
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
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Voices Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  await put('aiProviders', { id: id('prov'), createdAt: now, updatedAt: now, name: 'Mock voice key', label: 'Mock voice key', kind: 'openai-compatible', apiKey: 'sk-mock', baseUrl: 'http://127.0.0.1:5410/mock-voice/v1', defaultModel: 'mock-model', enabled: true })
  await put('aiPresets', { id: id('preset'), createdAt: now, updatedAt: now, name: 'Default', providerId: null, model: '', temperature: 0.2, topP: 1, systemPrompt: '', proseInstructions: '', contextRules: { precedingParagraphs: 3, includeCodex: false, codexTokenBudget: 0, includeLorebook: false, lorebookTokenBudget: 0 }, isDefault: true })
  const mkCh = async (title, order) => {
    const cid = id('ch')
    await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title, order, status: 'drafting' })
    return cid
  }
  const c1 = await mkCh('Chapter 1', 0)
  const c2 = await mkCh('Chapter 2', 1)
  const mk = async (cid, title, text, order) => {
    const sid = id('sc')
    await put('scenes', { id: sid, createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title, order, content: doc(text), plainText: text, wordCount: text.split(/\s+/).length, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
    return sid
  }
  const ford = await mk(c1, 'The Ford',
    '"Reckon we cross at first light," said Bram. "The maps say the ford is out," said Ana. "Reckon the maps are wrong," said Bram.', 0)
  await mk(c2, 'The Crossing',
    '"The maps were right," said Ana. "Who goes there?" The voice came from nowhere.', 0)
  db.close()
  return { pid, ford }
})

// ---- The tab reads the book's dialogue out, credited honestly. ----
await page.goto(`${BASE}#/planning?project=${ids.pid}`)
await eventually(async () => (await page.getByRole('tab', { name: 'Dialogue' }).count()) > 0)
await page.getByRole('tab', { name: 'Dialogue' }).click()
await eventually(async () => (await page.locator('[data-dialogue]').count()) > 0)
const body = await page.locator('[data-dialogue]').innerText()
check('every spoken line is read out', true, /Reckon we cross at first light/.test(body) && /The maps were right/.test(body))
check('all five lines are counted', true, /Every voice · 5 lines/.test(body))
const voices = await page.locator('[data-dialogue-voices]').innerText()
check('both voices appear with the unattributed remainder', true,
  /Bram/.test(voices) && /Ana/.test(voices) && /Unattributed/.test(voices))
check("Bram's pet word is found", true, /says reckon/.test(voices))
check('the untagged shout stays unattributed', true, /Who goes there\?/.test(body))

// ---- Filtering to one voice. ----
await page.locator('[data-dialogue-voices] button', { hasText: 'Bram' }).click()
await eventually(async () => /Everything Bram says/.test(await page.locator('[data-dialogue]').innerText()))
const bramOnly = await page.locator('[data-dialogue]').innerText()
check('the filter keeps his lines', true, /Reckon we cross/.test(bramOnly) && /Reckon the maps are wrong/.test(bramOnly))
check("the filter drops Ana's lines", false, /The maps were right/.test(bramOnly))

// ---- The AI voice check runs against the mock, never a real key. ----
await page.getByRole('button', { name: 'Check this voice' }).click()
const verdictShown = await eventually(async () => (await page.locator('[data-voice-verdict]').count()) > 0)
check('the voice check verdict streams in', true, verdictShown)
check('the verdict is the mocked reply', true,
  (await page.locator('[data-voice-verdict]').innerText()).includes('clipped register'))
check('exactly one call hit the mocked endpoint', 1, aiCalls)

// ---- A line is a door back into the manuscript. ----
await page.locator('[data-dialogue] ol button').first().click()
const landed = await eventually(async () => page.url().includes(`scene=${ids.ford}`))
check('clicking a line opens its scene in the editor', true, landed)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
