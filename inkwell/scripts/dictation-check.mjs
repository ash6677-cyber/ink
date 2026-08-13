/**
 * Dictation, proven live twice over — no real microphone, no real key:
 *
 * 1. Browser path: a controllable fake SpeechRecognition is injected
 *    before the app loads; the mic button arms it; the harness "speaks"
 *    a sentence with spoken punctuation, and the words land in the real
 *    editor at the cursor as typed prose — comma, period, new paragraph
 *    all honored; stopping disarms.
 * 2. Whisper fallback: a context with NO speech recognition at all, a
 *    fake microphone (Chromium's fake media stream), and a mocked
 *    /audio/transcriptions endpoint on the writer's key — record, stop,
 *    the mocked transcript lands in the editor through the same grammar,
 *    and the request carried the writer's own bearer key.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/dictation-check.mjs
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

const browser = await chromium.launch({
  executablePath: CHROMIUM_PATH,
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
})
const errors = []

const seed = async (page, title) =>
  page.evaluate(async (bookTitle) => {
    const open = indexedDB.open('inkwell')
    const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
    const now = Date.now()
    const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
    const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
    const pid = id('p')
    await put('projects', { id: pid, createdAt: now, updatedAt: now, title: bookTitle, author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
    await put('aiProviders', { id: id('prov'), createdAt: now, updatedAt: now, name: 'Whisper key', label: 'Whisper key', kind: 'openai-compatible', apiKey: 'sk-whisper-test', baseUrl: 'http://127.0.0.1:5410/mock-stt/v1', defaultModel: 'mock', enabled: true })
    const cid = id('ch')
    await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: 'Chapter 1', order: 0, status: 'drafting' })
    await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: 'Scene 1', order: 0, content: null, plainText: '', wordCount: 0, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
    db.close()
    return pid
  }, title)

// ══ Part 1: the browser recognizer. ════════════════════════════════════════
const ctx1 = await browser.newContext({ viewport: { width: 1400, height: 950 } })
await ctx1.addInitScript(() => {
  class FakeRecognition {
    constructor() {
      this.continuous = false
      this.interimResults = false
      this.lang = ''
      this.onresult = null
      this.onend = null
      this.onerror = null
    }
    start() {
      window.__dictationArmed = true
      window.__speak = (transcript) => {
        this.onresult?.({
          resultIndex: 0,
          results: [{ isFinal: true, 0: { transcript }, length: 1 }],
        })
      }
    }
    stop() {
      window.__dictationArmed = false
      this.onend?.()
    }
  }
  window.SpeechRecognition = FakeRecognition
})
const P1 = await ctx1.newPage()
P1.on('pageerror', (e) => errors.push(`browser-path: ${e}`))
await P1.goto(`${BASE}#/projects`)
await P1.waitForTimeout(800)
const pid1 = await seed(P1, 'Spoken Book')

await P1.goto(`${BASE}#/editor?project=${pid1}`)
await eventually(async () => (await P1.getByRole('button', { name: 'Dictate into this scene' }).count()) > 0)
await P1.getByRole('button', { name: 'Dictate into this scene' }).click()
const armed = await eventually(async () => P1.evaluate(() => window.__dictationArmed === true))
check('the mic button arms the browser recognizer', true, armed)

await P1.evaluate(() => window.__speak('the river said comma we go now period new paragraph and so they went'))
const landed = await eventually(async () => {
  const text = await P1.locator('.tiptap').innerText()
  return /The river said, we go now\./.test(text) && /And so they went/.test(text)
})
check('spoken words land as typed prose at the cursor', true, landed,
  (await P1.locator('.tiptap').innerText()).slice(0, 80))
check('the spoken paragraph break is a real paragraph', true,
  (await P1.locator('.tiptap p').count()) >= 2)

await P1.getByRole('button', { name: 'Stop dictation' }).click()
check('stopping disarms the recognizer', true,
  await eventually(async () => P1.evaluate(() => window.__dictationArmed === false)))
await P1.waitForTimeout(2500) // autosave the dictated prose

// ══ Part 2: the Whisper fallback, no browser recognizer at all. ════════════
const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 950 } })
await ctx2.addInitScript(() => {
  delete window.SpeechRecognition
  delete window.webkitSpeechRecognition
})
const P2 = await ctx2.newPage()
P2.on('pageerror', (e) => errors.push(`whisper-path: ${e}`))
let sttAuth = ''
let sttCalls = 0
await P2.route('**/mock-stt/**', async (route) => {
  sttCalls++
  sttAuth = route.request().headers()['authorization'] ?? ''
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ text: 'she waited at the ford comma counting boats period' }),
  })
})
await P2.goto(`${BASE}#/projects`)
await P2.waitForTimeout(800)
const pid2 = await seed(P2, 'Whispered Book')

await P2.goto(`${BASE}#/editor?project=${pid2}`)
await eventually(async () => (await P2.getByRole('button', { name: 'Dictate into this scene' }).count()) > 0)
await P2.getByRole('button', { name: 'Dictate into this scene' }).click()
await eventually(async () => (await P2.getByRole('button', { name: 'Stop dictation' }).count()) > 0)
await P2.waitForTimeout(900) // record a beat of fake audio
await P2.getByRole('button', { name: 'Stop dictation' }).click()

const transcribed = await eventually(async () =>
  /She waited at the ford, counting boats\./.test(await P2.locator('.tiptap').innerText()))
check('the Whisper fallback transcribes into the editor', true, transcribed,
  (await P2.locator('.tiptap').innerText()).slice(0, 80))
check('exactly one request hit the writer’s own endpoint', 1, sttCalls)
check('…carrying the writer’s own key', 'Bearer sk-whisper-test', sttAuth)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
