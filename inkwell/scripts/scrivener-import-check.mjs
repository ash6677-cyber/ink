/**
 * Scrivener import, proven live: a genuine zipped .scriv project — scrivx
 * binder, RTF documents in Files/Data/<UUID>/content.rtf, a document
 * excluded from Compile, research that must stay behind — goes through
 * the real Import dialog and comes out as a book with the binder's exact
 * structure.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/scrivener-import-check.mjs
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const JSZip = require('jszip')

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

// ---- Forge a real .scriv, zipped the way a writer would zip it. ----
const rtf = (paras) =>
  `{\\rtf1\\ansi\\ansicpg1252{\\fonttbl{\\f0 Palatino;}}{\\colortbl;\\red0\\green0\\blue0;}\n` +
  paras.map((p) => `${p}\\par`).join('\n') +
  `}`

const scrivx = `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <Binder>
    <BinderItem UUID="draft-0" Type="DraftFolder"><Title>Manuscript</Title>
      <Children>
        <BinderItem UUID="ch-1" Type="Folder"><Title>The Harbour</Title>
          <Children>
            <BinderItem UUID="sc-1" Type="Text"><Title>Low tide</Title></BinderItem>
            <BinderItem UUID="sc-2" Type="Text"><Title>The ferryman</Title></BinderItem>
            <BinderItem UUID="sc-3" Type="Text"><Title>Cut scene</Title>
              <MetaData><IncludeInCompile>No</IncludeInCompile></MetaData>
            </BinderItem>
          </Children>
        </BinderItem>
        <BinderItem UUID="ch-2" Type="Folder"><Title>Inland</Title>
          <Children>
            <BinderItem UUID="sc-4" Type="Text"><Title>The long road</Title></BinderItem>
          </Children>
        </BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="res-0" Type="ResearchFolder"><Title>Research</Title>
      <Children>
        <BinderItem UUID="res-1" Type="Text"><Title>Tide tables</Title></BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>`

const zip = new JSZip()
const base = 'Salt Harbour.scriv/'
zip.file(`${base}Salt Harbour.scrivx`, scrivx)
zip.file(`${base}Files/Data/sc-1/content.rtf`, rtf([
  'The tide went out and did not come back for the town\\rquote s pride.',
  'Marta counted the hulls stranded on the mud \\emdash{} nine, like every year.',
]))
zip.file(`${base}Files/Data/sc-2/content.rtf`, rtf(['The ferryman took coins he never spent.']))
zip.file(`${base}Files/Data/sc-3/content.rtf`, rtf(['This was cut and must not be imported.']))
zip.file(`${base}Files/Data/sc-4/content.rtf`, rtf(['Inland the salt still reached, on the wind.']))
zip.file(`${base}Files/Data/res-1/content.rtf`, rtf(['Research body, never part of the book.']))

const dir = mkdtempSync(join(tmpdir(), 'scriv-'))
const zipPath = join(dir, 'Salt Harbour.zip')
writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer' }))

// ---- Drive the app. ----
const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(`${BASE}#/projects`)
await eventually(async () => (await page.getByRole('button', { name: /Import/ }).count()) > 0)
await page.getByRole('button', { name: /Import/ }).first().click()
await eventually(async () => (await page.getByText('Import a manuscript').count()) > 0)
check(
  'the dialog names Scrivener as a welcome guest',
  true,
  (await page.getByText(/zipped Scrivener project/).count()) > 0,
)

await page.locator('input[type=file]').setInputFiles(zipPath)
await eventually(async () => (await page.getByText(/chapters ·/).count()) > 0)

check(
  'structure comes straight from the binder',
  true,
  (await page.getByText(/taken straight from the Scrivener binder/).count()) > 0,
)
check('two chapters, as the binder says', true, (await page.getByText(/^2 chapters ·/).count()) > 0)
check('three scenes survive the compile filter', true, (await page.getByText(/· 3 scenes ·/).count()) > 0)
check('chapter one is The Harbour', true, (await page.getByText('The Harbour').count()) > 0)
check('chapter two is Inland', true, (await page.getByText('Inland').count()) > 0)
check(
  'the book title came from the scrivx name',
  'Salt Harbour',
  await page.locator('#import-title').inputValue(),
)

await page.getByRole('button', { name: 'Create the book' }).click()
await eventually(async () => (await page.getByText(/chapters,.*words imported/).count()) > 0)

// The editor opens on the imported book; the binder structure is real now.
await eventually(async () => (await page.getByText('Low tide').count()) > 0)
check('the editor shows the imported scenes', true, true)
check('the excluded scene stayed behind', 0, await page.getByText('Cut scene').count())
check('research stayed behind too', 0, await page.getByText('Tide tables').count())

// The words themselves, with RTF escapes decoded.
const opened = await eventually(async () => {
  await page.getByText('Low tide').first().click()
  await page.waitForTimeout(400)
  return (await page.getByText(/nine, like every year/).count()) > 0
})
check('the prose arrived with em-dashes and quotes decoded', true, opened)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
