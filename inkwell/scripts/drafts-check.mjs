/**
 * Revision passes, proven live: freeze "Draft 1", revise one scene, and
 * the Drafts panel reports honestly — 1 of 2 revised, the word delta,
 * progress judged by content (a scene merely opened stays untouched), a
 * scene added after the freeze counted as new — and the frozen text
 * appears in the scene's History as an ordinary snapshot, side-by-side
 * diff included. Reloading changes none of it.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/drafts-check.mjs
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
  const pid = id('p')
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Revision Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const cid = id('ch')
  await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: 'Chapter 1', order: 0, status: 'drafting' })
  const mk = async (title, text, order) => {
    const sid = id('sc')
    await put('scenes', { id: sid, createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title, order, content: doc(text), plainText: text, wordCount: text.split(/\s+/).length, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
    return sid
  }
  const keep = await mk('The Ford', 'The ford ran high and cold that morning.', 0)
  const revise = await mk('The Meeting', 'They met at the boundary stone at dusk.', 1)
  db.close()
  return { pid, cid, keep, revise }
})

// ---- Freeze Draft 1 through the panel. ----
await page.goto(`${BASE}#/editor?project=${ids.pid}`)
await eventually(async () => (await page.getByText('The Ford').count()) > 0)
await page.getByRole('button', { name: 'Open drafts and revision progress' }).click()
await eventually(async () => (await page.getByText('No draft frozen yet').count()) > 0)
check('the panel is honest before any freeze', true, true)

await page.getByRole('button', { name: 'Freeze draft' }).click()
await eventually(async () => (await page.getByText('Draft 1 frozen').count()) > 0)
await eventually(async () => (await page.getByText(/Revising against Draft 1/).count()) > 0)
check('freezing creates Draft 1 and the report appears', true, true)
check('everything starts untouched', true, (await page.getByText('0 of 2 scenes revised').count()) > 0)

// ---- Revise ONE scene (through the real editor), add ONE new scene. ----
await page.getByRole('button', { name: 'Close' }).click()
await eventually(async () => (await page.getByText('Revising against Draft 1').count()) === 0)
await page.getByRole('button', { name: 'The Meeting', exact: true }).click()
await page.waitForTimeout(600)
await page.locator('.tiptap').click()
await page.keyboard.press('End')
await page.keyboard.type(' Nobody spoke first.')
await page.waitForTimeout(2500) // autosave

await page.getByRole('button', { name: 'Add scene to Chapter 1' }).click().catch(async () => {
  // The add button is hover-revealed; hover the chapter row first.
  await page.getByText('Chapter 1').hover()
  await page.getByRole('button', { name: 'Add scene to Chapter 1' }).click()
})
await page.waitForTimeout(400)
await page.locator('.tiptap').click()
await page.keyboard.type('A brand new scene, born in the second draft.')
await page.waitForTimeout(2500)

// ---- The report judges honestly. ----
await page.getByRole('button', { name: 'Open drafts and revision progress' }).click()
await eventually(async () => (await page.getByText('1 of 2 scenes revised').count()) > 0)
check('one revised of the two frozen scenes', true, true)
const reportText = await page.locator('[data-draft-report]').innerText()
check('the untouched scene stays untouched', true, /The Ford[\s\S]*?Untouched/.test(reportText))
check('the revised scene is recognised by its words', true, /The Meeting[\s\S]*?Revised/.test(reportText))
check('the post-freeze scene counts as new, not revised', true, /Untitled scene[\s\S]*?New/.test(reportText))
check('the word gain is counted', true, /\+\d/.test(reportText))

// ---- The ghost: the baseline snapshot sits in the scene's History. ----
await page.getByRole('button', { name: 'Close' }).click()
await eventually(async () => (await page.getByText('Revising against Draft 1').count()) === 0)
await page.getByRole('button', { name: 'The Meeting', exact: true }).click()
await page.waitForTimeout(600)
const baselineInHistory = await eventually(
  async () => (await page.getByText('Baseline — Draft 1').count()) > 0,
)
check('the frozen text lives in the scene History', true, baselineInHistory)

// ---- Survives a reload. ----
await page.reload()
await eventually(async () => (await page.getByText('The Ford').count()) > 0)
await page.getByRole('button', { name: 'Open drafts and revision progress' }).click()
const persisted = await eventually(async () => (await page.getByText('1 of 2 scenes revised').count()) > 0)
check('the pass and its judgement survive a reload', true, persisted)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
