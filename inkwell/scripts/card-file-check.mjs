/**
 * §4.4/4.5 acceptance, through the real UI: a character leaves as a JSON
 * file and as a PNG card, and the PNG comes back in as the same character —
 * portrait, dialogue, design and all.
 *
 *   INKWELL_BASE_PATH=/ npm run build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/card-file-check.mjs
 */
import { readFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? '/opt/node22/lib/node_modules/playwright/index.mjs'
)
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5410/'
const DOWNLOADS = mkdtempSync(join(tmpdir(), 'inkwell-cards-'))

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
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(1200)

// A project with one fully-dressed character: portrait, dialogue, design.
const { projectId } = await page.evaluate(async () => {
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

  // A 2×2 red PNG as the portrait, generated right here.
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 2
  const c2d = canvas.getContext('2d')
  c2d.fillStyle = '#c0392b'
  c2d.fillRect(0, 0, 2, 2)
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  const imageId = id('img')
  await put('imageAssets', {
    id: imageId, createdAt: now, updatedAt: now, blob, mimeType: 'image/png',
    width: 2, height: 2, fileName: 'maren.png',
  })

  await put('characterCards', {
    id: id('card'), createdAt: now, updatedAt: now, projectId, codexEntryId: null,
    displayName: 'Maren Voss', avatarImageId: imageId, cropSettings: { x: 40, y: 60, zoom: 1.2 },
    design: { frame: 'arch', finish: 'foil', accent: 'oklch(70% 0.12 250)', gloss: 0.7, vignette: 0.4 },
    description: 'Keeper of the ferry ledger.', personality: 'Wry, unhurried.',
    scenario: 'The inn, the night the ferry did not come.',
    firstMessage: 'You are late, which means you walked.',
    exampleDialogue: [{ id: id('l'), input: 'Where is Old Tam?', response: 'Where the tide left him.' }],
    systemPromptOverride: null, voiceNotes: 'Never raises her voice.', tags: ['keeper', 'ledger'],
  })
  db.close()
  return { projectId }
})

await page.goto(`${BASE}#/playground/cards?project=${projectId}`)
await page.waitForTimeout(1500)

async function exportVia(menuItem) {
  await page.getByRole('button', { name: 'More actions for Maren Voss' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: menuItem }).click(),
  ])
  const path = join(DOWNLOADS, download.suggestedFilename())
  await download.saveAs(path)
  return { path, name: download.suggestedFilename() }
}

// ── JSON out ────────────────────────────────────────────────────────────────
const json = await exportVia('Export card file')
check('the JSON export downloads under the character’s name', 'Maren Voss.inkwell-card.json', json.name)
const jsonBody = JSON.parse(readFileSync(json.path, 'utf8'))
check('…and contains the character', 'inkwell-character-card', jsonBody.kind)
check('…prose and dialogue included', 'Where the tide left him.', jsonBody.exampleDialogue?.[0]?.response)
check('…portrait travelling inside as a data URL', true, String(jsonBody.avatarDataUrl ?? '').startsWith('data:image/'))
check('…design included', 'foil', jsonBody.design?.finish)

// ── PNG out ─────────────────────────────────────────────────────────────────
const png = await exportVia('Export as PNG card')
check('the PNG export downloads', 'Maren Voss.inkwell-card.png', png.name)
const pngBytes = readFileSync(png.path)
check('…and is a real PNG', true, pngBytes[0] === 0x89 && pngBytes[1] === 0x50)
check('…bigger than an empty frame', true, pngBytes.length > 5000, `${pngBytes.length} bytes`)

// ── The PNG comes back in as the whole character ────────────────────────────
await page.getByRole('button', { name: 'Card file' }).click()
await page.locator('input[type="file"][aria-label="Import a card file"]').setInputFiles(png.path)
await page.waitForTimeout(600)
check('the preview dialog appears', true, (await page.getByText('Import this character?').count()) > 0)
check(
  '…listing what arrives',
  true,
  (await page.getByText(/portrait.*card design|card design/).count()) > 0,
)
await page.getByRole('button', { name: 'Add to cast' }).click()
await page.waitForTimeout(1200)

const reimported = await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((res, rej) => {
    open.onsuccess = () => res(open.result)
    open.onerror = () => rej(open.error)
  })
  const cards = await new Promise((res, rej) => {
    const tx = db.transaction('characterCards', 'readonly')
    const req = tx.objectStore('characterCards').getAll()
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
  const images = await new Promise((res, rej) => {
    const tx = db.transaction('imageAssets', 'readonly')
    const req = tx.objectStore('imageAssets').getAll()
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
  db.close()
  const marens = cards.filter((c) => c.displayName === 'Maren Voss')
  const copy = marens.find((c) => c.description === 'Keeper of the ferry ledger.' && c.id !== marens[0].id) ?? marens[1]
  return {
    count: marens.length,
    dialogue: copy?.exampleDialogue?.[0]?.response ?? null,
    finish: copy?.design?.finish ?? null,
    hasPortrait: Boolean(copy?.avatarImageId && images.some((i) => i.id === copy.avatarImageId)),
    voiceNotes: copy?.voiceNotes ?? null,
  }
})
check('the cast now holds the original and the import', 2, reimported.count)
check('…dialogue survived the trip through the picture', 'Where the tide left him.', reimported.dialogue)
check('…design survived', 'foil', reimported.finish)
check('…the portrait was rebuilt as a real image asset', true, reimported.hasPortrait)
check('…voice notes survived', 'Never raises her voice.', reimported.voiceNotes)

// ── A PNG with no card inside is refused politely ───────────────────────────
await page.getByRole('button', { name: 'Card file' }).click()
const plainPng = join(DOWNLOADS, 'plain.png')
const { writeFileSync } = await import('node:fs')
writeFileSync(
  plainPng,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
)
await page.locator('input[type="file"][aria-label="Import a card file"]').setInputFiles(plainPng)
await page.waitForTimeout(600)
check('a plain PNG is named for what it is', true, (await page.getByText('Not a card file').count()) > 0)
check('…and no dialog opens for it', 0, await page.getByText('Import this character?').count())

check('no uncaught errors anywhere along the way', [], pageErrors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
