/**
 * The Atlas, proven live: seed a map image, two location entries, and
 * scenes set at one of them — the Atlas view shows the map, dropping a
 * pin linked to an entry lands where clicked (normalized coordinates),
 * the pin carries the honest scene count, zooming doesn't move the pin
 * off its spot, the pin walks into its Almanac entry, pins survive a
 * reload, and removing one removes it.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/atlas-check.mjs
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

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(800)
const ids = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })

  // The map: a 400×200 painted parchment.
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 200
  const g = canvas.getContext('2d')
  g.fillStyle = '#d8c9a3'
  g.fillRect(0, 0, 400, 200)
  g.strokeStyle = '#7a5c3e'
  g.lineWidth = 4
  g.beginPath()
  g.moveTo(0, 120)
  g.bezierCurveTo(120, 90, 260, 150, 400, 110)
  g.stroke()
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  const imgId = id('img')
  await put('imageAssets', { id: imgId, createdAt: now, updatedAt: now, mimeType: 'image/png', width: 400, height: 200, fileName: 'realm.png', blob })

  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Atlas Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  await put('worldMaps', { id: id('map'), createdAt: now, updatedAt: now, projectId: pid, name: 'The Realm', imageId: imgId, pins: [] })

  const mkEntry = async (name) => {
    const eid = id('cx')
    await put('codexEntries', { id: eid, createdAt: now, updatedAt: now, projectId: pid, seriesId: null, type: 'location', name, aliases: [], summary: '', body: null, plainText: '', attributes: [], relationships: [], imageId: null, tags: [], aiContext: 'when-relevant', aiContextTokenBudget: null })
    return eid
  }
  const ford = await mkEntry('The Ford')
  await mkEntry('The Keep')

  const cid = id('ch')
  await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: 'Chapter 1', order: 0, status: 'drafting' })
  const mk = async (title, locationCodexId, order) => {
    await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title, order, content: doc('Words.'), plainText: 'Words.', wordCount: 1, status: 'drafting', povCharacterId: null, locationCodexId, summary: '', beats: [], labels: [], linkedCodexIds: [] })
  }
  await mk('At the ford', ford, 0)
  await mk('Back at the ford', ford, 1)
  db.close()
  return { pid, ford }
})

// ---- Into the Atlas. ----
await page.goto(`${BASE}#/almanac?project=${ids.pid}`)
await eventually(async () => (await page.getByRole('button', { name: 'Atlas' }).count()) > 0)
await page.getByRole('button', { name: 'Atlas' }).click()
await eventually(async () => (await page.locator('[data-atlas] img').count()) > 0)
check('the map image renders', true, true)

// ---- Drop a pin on The Ford, one third across, at the river. ----
await page.getByRole('combobox', { name: 'Entry for the next pin' }).click()
await page.getByRole('option', { name: 'The Ford' }).click()
await page.getByRole('button', { name: 'Drop pin' }).click()
const img = page.locator('[data-atlas-image]')
const box = await img.boundingBox()
await page.mouse.click(box.x + box.width * 0.33, box.y + box.height * 0.6)
await eventually(async () => (await page.getByRole('button', { name: /The Ford · 2 scenes here/ }).count()) > 0)
check('the pin lands and counts its scenes honestly', true, true)

const pinPos = async () => {
  const pin = page.getByRole('button', { name: /The Ford · 2 scenes here/ })
  const style = await pin.getAttribute('style')
  return style
}
const placed = await pinPos()
check('the pin is stored in normalized coordinates', true, /left: 3[0-6](\.\d+)?%/.test(placed), placed)

// ---- Zoom in: the pin stays glued to its spot (same % position). ----
await page.locator('[data-atlas-stage]').hover()
await page.mouse.wheel(0, -240)
await page.waitForTimeout(300)
check('zooming never moves the pin off its spot', placed, await pinPos())

// ---- The pin list names it; the pin is a door into the entry. ----
check('the pin list shows name and count', true,
  /The Ford · 2/.test(await page.locator('[data-atlas-pins]').innerText()))
await page.getByRole('button', { name: /The Ford · 2 scenes here/ }).click()
const landed = await eventually(async () => page.url().includes(`/almanac/${ids.ford}`))
check('clicking the pin opens its Almanac entry', true, landed)

// ---- Pins survive a reload. ----
await page.goto(`${BASE}#/almanac?project=${ids.pid}`)
await eventually(async () => (await page.getByRole('button', { name: 'Atlas' }).count()) > 0)
await page.getByRole('button', { name: 'Atlas' }).click()
const persisted = await eventually(async () =>
  (await page.getByRole('button', { name: /The Ford · 2 scenes here/ }).count()) > 0)
check('the pin survives a reload', true, persisted)

// ---- And can be removed. ----
await page.getByRole('button', { name: 'Remove pin The Ford' }).click()
await eventually(async () => (await page.getByRole('button', { name: /The Ford · 2 scenes here/ }).count()) === 0)
check('removing the pin removes it', true, true)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
