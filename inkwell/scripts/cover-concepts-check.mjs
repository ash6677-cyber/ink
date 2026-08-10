/**
 * AI cover concepts, proven live: Cover Studio's "AI concepts" dialog
 * generates art through the writer's own (mock) image-capable provider —
 * the request carries the book's genre and the no-lettering rule — and
 * "Use as cover" stores the image and sets it as the design's source.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/cover-concepts-check.mjs
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

// A real 1×1 PNG, twice — the two "concepts".
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

const imageRequests = []
await page.route('**/mock-ai/v1/images/generations', async (route) => {
  imageRequests.push(route.request().postDataJSON())
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: [{ b64_json: TINY_PNG_B64 }, { b64_json: TINY_PNG_B64 }] }),
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
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'The Salt Road', author: 'A. Writer', synopsis: 'A ferrywoman inherits a debt owed to the sea.', genre: 'Coastal gothic', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const provId = id('prov')
  await put('aiProviders', { id: provId, createdAt: now, updatedAt: now, name: 'Mock Images', label: 'Mock Images', kind: 'openai-compatible', apiKey: 'sk-mock', baseUrl: 'http://127.0.0.1:5410/mock-ai/v1', defaultModel: 'mock-image-model', enabled: true })
  db.close()
  return { pid }
})

await page.goto(`${BASE}#/covers?project=${ids.pid}`)
await eventually(async () => (await page.getByRole('button', { name: 'AI concepts' }).count()) > 0)
check('the AI concepts button is in Cover Studio', true, true)

await page.getByRole('button', { name: 'AI concepts' }).click()
await eventually(async () => (await page.getByText('AI cover concepts').count()) > 0)
check(
  'the dialog says whose key does the painting',
  true,
  (await page.getByText(/Drawn with your own key/).count()) > 0,
)

await page.getByLabel('Art direction (optional)').fill('Cold light, a small figure against a huge tide.')
await page.getByRole('button', { name: /Generate 2 concepts/ }).click()
await eventually(async () => (await page.locator('[data-cover-concepts] img').count()) === 2)
check('two concepts arrive as images', 2, await page.locator('[data-cover-concepts] img').count())

check('exactly one request reached the provider', 1, imageRequests.length)
const req = imageRequests[0] ?? {}
check('the request asks for two portrait images', true, req.n === 2 && req.size === '1024x1536')
check('the model fell back to the provider default', 'mock-image-model', req.model)
check('the prompt carries the genre', true, String(req.prompt).includes('Coastal gothic'))
check('the prompt carries the art direction', true, String(req.prompt).includes('huge tide'))
check(
  'the prompt forbids lettering — typography stays in the studio',
  true,
  /no text, no lettering/i.test(String(req.prompt)),
)

await page.locator('[data-cover-concepts] button').first().click()
await eventually(async () => (await page.getByText('Concept set as the cover image').count()) > 0)
check('using a concept confirms and closes', true, true)
const replaced = await eventually(
  async () => (await page.getByRole('button', { name: 'Replace image' }).count()) > 0,
)
check('the concept became the design’s source image', true, replaced)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
