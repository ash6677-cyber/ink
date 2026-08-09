/**
 * The continuity sentinel, proven end to end with a fake provider.
 *
 * Seeds an Almanac fact (Marta's eyes are grey) and a scene that
 * contradicts it (her green eyes), plus a mocked OpenAI-compatible model
 * that returns one real finding and one that points at a nonexistent
 * entry. The app must surface the real contradiction, drop the phantom,
 * and — when nothing conflicts — say so.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/continuity-check.mjs
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

function sseBody(text) {
  return (
    [...text].map((ch) => `data: ${JSON.stringify({ choices: [{ delta: { content: ch } }] })}\n\n`).join('') +
    'data: [DONE]\n\n'
  )
}

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

// The mock reply is built once we know the seeded entry id, so route lazily.
let martaId = ''
await page.route('**/mock-ai/**', async (route) => {
  const reply = JSON.stringify([
    { entryId: martaId, fact: 'Eyes: grey', sceneClaim: 'her green eyes', severity: 'contradiction', explanation: 'Eye colour changed.' },
    { entryId: 'ghost-entry', fact: 'x', sceneClaim: 'y', severity: 'contradiction', explanation: 'phantom' },
  ])
  await route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sseBody(reply) })
})

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(900)
const seeded = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Continuity Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const cid = id('ch')
  await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: 'Chapter 1', order: 0, status: 'draft' })
  const text = 'Marta turned, and her green eyes caught the light.'
  await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: 'Scene 1', order: 0, content: doc(text), plainText: text, wordCount: text.split(/\s+/).length, status: 'draft', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
  const marta = id('codex')
  await put('codexEntries', { id: marta, createdAt: now, updatedAt: now, projectId: pid, seriesId: null, type: 'character', name: 'Marta', aliases: [], summary: 'The lighthouse keeper.', body: null, plainText: '', attributes: [{ id: 'a1', key: 'Eyes', value: 'grey' }], relationships: [], imageId: null, tags: [], aiContext: 'auto', aiContextTokenBudget: null })
  const provId = id('prov')
  await put('aiProviders', { id: provId, createdAt: now, updatedAt: now, name: 'Mock', kind: 'openai-compatible', apiKey: 'sk-mock', baseUrl: 'http://127.0.0.1:5410/mock-ai/v1', defaultModel: 'mock-model' })
  await put('aiPresets', { id: id('preset'), createdAt: now, updatedAt: now, name: 'Default', providerId: provId, model: 'mock-model', temperature: 0.7, topP: 1, systemPrompt: '', proseInstructions: '', contextRules: { precedingParagraphs: 3, includeCodex: false, codexTokenBudget: 0, includeLorebook: false, lorebookTokenBudget: 0 }, isDefault: true })
  db.close()
  return { pid, marta }
})
martaId = seeded.marta

await page.goto(`${BASE}#/editor?project=${seeded.pid}`)
await eventually(async () => (await page.locator('.editor-prose').count()) > 0)
await page.waitForTimeout(1000)

await page.getByRole('button', { name: 'Continuity check' }).click()
await eventually(async () => (await page.getByRole('heading', { name: 'Continuity check' }).count()) > 0)
await page.getByRole('button', { name: 'Check continuity', exact: true }).click()

const flagged = await eventually(async () => (await page.getByText('Eye colour changed.').count()) > 0)
check('the sentinel flags the real contradiction', true, flagged)
check('it names the Almanac entry', true, (await page.getByText(/Contradiction · Marta/).count()) > 0)
check('a finding pointing at no real entry is dropped', 0, await page.getByText('phantom').count())
check('exactly one finding is shown', 1, await page.getByText(/Contradiction ·/).count())
check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
