/**
 * §13.4/§14.3 acceptance, through the real UI: a feature can name its own
 * preset, and a custom system prompt saved in the library reaches the
 * context preview verbatim.
 *
 *   INKWELL_BASE_PATH=/ npm run build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/preset-library-check.mjs
 */
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? '/opt/node22/lib/node_modules/playwright/index.mjs'
)
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5410/'

const CUSTOM_PROMPT = 'Write like the tide is listening.'

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
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

await page.goto(`${BASE}#/projects`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)

const { projectId } = await page.evaluate(async (customPrompt) => {
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
  await put('scenes', {
    id: id('s'), createdAt: now, updatedAt: now, projectId, chapterId, title: 'Harbour Morning',
    order: 0, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The tide came in.' }] }] },
    plainText: 'The tide came in.', wordCount: 4, status: 'drafting', povCharacterId: null,
    locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [],
  })
  const contextRules = {
    includeCodex: true, codexTokenBudget: 0, includeLorebook: true,
    lorebookTokenBudget: 0, precedingParagraphs: 3,
  }
  const preset = (name, isDefault, systemPrompt) => ({
    id: `preset-${name.toLowerCase()}`, createdAt: now, updatedAt: now, name,
    providerId: '', model: 'test-model', temperature: 0.7, topP: 1, isDefault,
    systemPrompt, proseInstructions: '', contextRules,
  })
  // The panel needs a provider with a key before it offers anything.
  const providerId = 'prov-test'
  await put('aiProviders', {
    id: providerId, createdAt: now, updatedAt: now, kind: 'openai-compatible',
    label: 'Test provider', apiKey: 'test-key', baseUrl: 'http://127.0.0.1:9', 
    defaultModel: 'test-model', enabled: true,
  })
  const plain = preset('Plain', true, '')
  const tidewriter = preset('Tidewriter', false, customPrompt)
  plain.providerId = providerId
  tidewriter.providerId = providerId
  await put('aiPresets', plain)
  await put('aiPresets', tidewriter)
  db.close()
  return { projectId }
}, CUSTOM_PROMPT)

// ── Choose Tidewriter for editor actions, through the real Settings UI ─────
await page.goto(`${BASE}#/settings?tab=ai`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)

// The settings search finds the new control too.
await page.getByLabel('Search settings').fill('preset per feature')
await page.waitForTimeout(300)
await page.getByRole('button', { name: /Preset per feature/ }).click()
await page.waitForTimeout(800)
check(
  'settings search lands on the feature-preset control',
  true,
  await page.locator('#setting-feature-presets').isVisible(),
)

const editorSelect = page.getByRole('combobox', { name: 'Preset for Editor actions' })
check('the selector defaults to the global default', true, (await editorSelect.textContent()).includes('Plain'))
await editorSelect.click()
await page.getByRole('option', { name: 'Tidewriter' }).click()
await page.waitForTimeout(400)
const persisted = await page.evaluate(
  () => JSON.parse(localStorage.getItem('inkwell-preferences') ?? '{}').state?.featurePresets,
)
check('the choice persists', { editorActions: 'preset-tidewriter' }, persisted)

// ── The editor's AI panel starts from Tidewriter, prompt verbatim ──────────
await page.goto(`${BASE}#/editor?project=${projectId}`, { waitUntil: 'domcontentloaded' })
await page.locator('.editor-prose').first().waitFor({ timeout: 15000 })
await page.getByRole('button', { name: 'AI assistant' }).click()
await page.waitForTimeout(800)

check(
  'the AI panel starts from the feature’s own preset',
  true,
  (await page.getByText('Tidewriter').count()) > 0,
)
await page.getByRole('button', { name: /What the AI sees/ }).click()
await page.waitForTimeout(500)
const previewText = await page.locator('body').innerText()
check(
  'the custom system prompt reaches the preview verbatim',
  true,
  previewText.includes(CUSTOM_PROMPT),
)

// ── The global default still governs features left unset ───────────────────
const chatResolved = await page.evaluate(() => {
  const prefs = JSON.parse(localStorage.getItem('inkwell-preferences') ?? '{}').state?.featurePresets ?? {}
  return prefs.chat ?? 'unset'
})
check('chat stays on the global default (never chosen)', 'unset', chatResolved)

check('no uncaught errors anywhere along the way', [], pageErrors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
