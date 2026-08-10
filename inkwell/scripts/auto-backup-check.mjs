/**
 * The weekly backup ritual, proven live: opting in from the nudge turns
 * the reminder off for good and the app then saves a real `.inkwell`
 * library file on its own — a genuine browser download whose JSON holds
 * the manuscript — once per week and not a download more. The Settings
 * toggle shows and controls the same switch.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/auto-backup-check.mjs
 */
import { readFileSync } from 'node:fs'

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
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

// ---- A library with real words, and a backup long overdue. ----
await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(800)
await page.evaluate(async () => {
  const open = indexedDB.open('inkwell')
  const db = await new Promise((r) => { open.onsuccess = () => r(open.result) })
  const now = Date.now()
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 10)}`
  const put = (s, v) => new Promise((res) => { const tx = db.transaction(s, 'readwrite'); tx.objectStore(s).put(v); tx.oncomplete = res })
  const doc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Ritual Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const cid = id('ch')
  await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: 'Chapter 1', order: 0, status: 'drafting' })
  const words = Array.from({ length: 400 }, () => 'ink').join(' ')
  await put('scenes', { id: id('sc'), createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title: 'Scene 1', order: 0, content: doc(words), plainText: words, wordCount: 400, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
  db.close()
  // The last manual backup was ancient, so the nudge is due immediately.
  const prefs = JSON.parse(localStorage.getItem('inkwell-preferences') ?? '{"state":{},"version":0}')
  prefs.state.lastBackupAt = now - 30 * 86400000
  prefs.state.backupSnoozedUntil = 0
  localStorage.setItem('inkwell-preferences', JSON.stringify(prefs))
})
await page.reload()

// ---- The nudge offers the ritual; taking it downloads within seconds. ----
const nudgeUp = await eventually(async () => (await page.getByText(/It's been a while since your last backup/).count()) > 0)
check('the manual nudge appears when a backup is overdue', true, nudgeUp)

const downloadPromise = page.waitForEvent('download', { timeout: 30000 })
await page.getByRole('button', { name: 'Do this weekly, automatically' }).click()
check(
  'opting in confirms the ritual is on',
  true,
  (await eventually(async () => (await page.getByText('Weekly backups are on').count()) > 0)) !== false,
)

const download = await downloadPromise
check(
  'a backup file downloads by itself',
  true,
  /^inkwell-library-\d{4}-\d{2}-\d{2}\.inkwell$/.test(download.suggestedFilename()),
  download.suggestedFilename(),
)
const body = readFileSync(await download.path(), 'utf8')
const parsed = JSON.parse(body)
check('the file is a real library document', true, Array.isArray(parsed.projects) && parsed.projects.length === 1)
check('…with the manuscript inside', true, JSON.stringify(parsed.projects).includes('Ritual Book'))

const marked = await eventually(async () =>
  page.evaluate(() => {
    const prefs = JSON.parse(localStorage.getItem('inkwell-preferences') ?? '{}')
    return typeof prefs.state?.lastAutoBackupAt === 'number' && prefs.state?.autoBackupEnabled === true
  }),
)
check('the run is remembered (enabled + timestamped)', true, marked)

// ---- Not due again: a reload must NOT download a second file. ----
let surprises = 0
page.on('download', () => { surprises += 1 })
await page.reload()
await page.waitForTimeout(9000) // past the ritual's idle delay
check('no second download inside the same week', 0, surprises)
check('the nudge stays quiet now the ritual covers it', 0, await page.getByText(/It's been a while since your last backup/).count())

// ---- Settings shows the same switch, on, with the next run named. ----
await page.goto(`${BASE}#/settings`)
await page.getByRole('tab', { name: 'Data' }).click()
await page.waitForTimeout(500)
check('the Settings toggle reflects the ritual', 'true',
  await page.getByLabel('Weekly automatic backup').getAttribute('data-state') === 'checked' ? 'true' : 'false')
check('Settings names the next run', true, (await page.getByText(/Next one around/).count()) > 0)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
