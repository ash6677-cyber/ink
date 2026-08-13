/**
 * Promises & payoffs, proven live: select a passage in the real editor and
 * mark it as a promise — it lands on the Planning ledger as Open with the
 * quote attached and an unpaid warning; link its payoff scene and the row
 * turns Paid with its span while the warning goes; add a second promise
 * from the ledger itself and the warning returns; reload and everything
 * holds; the setup link walks back into the editor.
 *
 *   INKWELL_BASE_PATH=/ npx vite build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/promises-check.mjs
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
  await put('projects', { id: pid, createdAt: now, updatedAt: now, title: 'Ledger Book', author: 'A', synopsis: '', genre: '', targetWordCount: 80000, coverId: null, seriesId: null, seriesOrder: 0, status: 'drafting', settings: { defaultAiPresetId: null, pov: 'third-limited', tense: 'past', measureWidthCh: 68, structureMode: 'scenes' } })
  const cid = id('ch')
  await put('chapters', { id: cid, createdAt: now, updatedAt: now, projectId: pid, title: 'Chapter 1', order: 0, status: 'drafting' })
  const mk = async (title, text, order) => {
    const sid = id('sc')
    await put('scenes', { id: sid, createdAt: now, updatedAt: now, chapterId: cid, projectId: pid, title, order, content: doc(text), plainText: text, wordCount: text.split(/\s+/).length, status: 'drafting', povCharacterId: null, locationCodexId: null, summary: '', beats: [], labels: [], linkedCodexIds: [] })
    return sid
  }
  const locket = await mk('The Locket', 'The locket her mother never explained sat in the drawer.', 0)
  await mk('The Market', 'The market was loud and smelled of rain.', 1)
  const reveal = await mk('The Reveal', 'She opened the locket at last.', 2)
  db.close()
  return { pid, locket, reveal }
})

// ---- Mark a selected passage as a promise, from inside the editor. ----
await page.goto(`${BASE}#/editor?project=${ids.pid}&scene=${ids.locket}`)
await eventually(async () => (await page.locator('.tiptap').count()) > 0)
await page.locator('.tiptap').click()
await page.keyboard.press('Home')
await page.keyboard.press('Shift+End')
await page.getByRole('button', { name: 'Mark a promise in this scene' }).click()
await eventually(async () => (await page.getByText('Mark a promise', { exact: true }).count()) > 0)
const suggested = await page.locator('#promise-title').inputValue()
check('the selection suggests the title', true, suggested.startsWith('The locket her mother'))
check('the quoted passage is shown', true,
  (await page.getByText('sat in the drawer', { exact: false }).count()) > 0)
await page.getByRole('button', { name: 'Put it on the ledger' }).click()
await eventually(async () => (await page.getByText('Promise made').count()) > 0)
check('marking from the prose lands on the ledger', true, true)

// ---- The ledger shows it open, with the unpaid warning. ----
await page.goto(`${BASE}#/planning?project=${ids.pid}`)
await eventually(async () => (await page.getByRole('tab', { name: 'Promises' }).count()) > 0)
await page.getByRole('tab', { name: 'Promises' }).click()
await eventually(async () => (await page.locator('[data-promises]').count()) > 0)
const ledger1 = await page.locator('[data-promises]').innerText()
check('the promise is listed as open', true, /The locket her mother[\s\S]*?Open/.test(ledger1))
check('the unpaid warning names it', true,
  (await page.locator('[data-unpaid-warning]').count()) > 0 &&
    /1 promise is still unpaid/.test(await page.locator('[data-unpaid-warning]').innerText()))

// ---- Link the payoff: Open becomes Paid, the warning goes. ----
await page.getByRole('combobox', { name: /Payoff scene for/ }).click()
await page.getByRole('option', { name: 'The Reveal' }).click()
await eventually(async () => (await page.getByText('Paid off').count()) > 0)
check('linking a payoff turns it paid', true, true)
check('the span is counted in scenes', true, /2 scenes later/.test(await page.locator('[data-promises]').innerText()))
check('the warning stands down once everything is paid', 0, await page.locator('[data-unpaid-warning]').count())

// ---- A promise added from the ledger itself reopens the warning. ----
await page.locator('#new-promise').fill('The rifle above the mantel')
await page.getByRole('combobox', { name: 'Scene where the promise is made' }).click()
await page.getByRole('option', { name: 'The Market' }).click()
await page.getByRole('button', { name: 'Add', exact: true }).click()
await eventually(async () => /The rifle above the mantel/.test(await page.locator('[data-promises]').innerText()))
check('a promise can be added from the ledger', true, true)
check('the warning returns for the new one', true,
  /rifle above the mantel/.test(await page.locator('[data-unpaid-warning]').innerText().catch(() => '')))

// ---- Survives a reload. ----
await page.reload()
await eventually(async () => (await page.getByRole('tab', { name: 'Promises' }).count()) > 0)
await page.getByRole('tab', { name: 'Promises' }).click()
const persisted = await eventually(async () => {
  const text = await page.locator('[data-promises]').innerText().catch(() => '')
  return /The locket her mother[\s\S]*?Paid off/.test(text) && /rifle above the mantel/.test(text)
})
check('the ledger survives a reload', true, persisted)

// ---- The setup link is a door back into the manuscript. ----
await page.getByRole('button', { name: 'The Locket', exact: true }).click()
const landed = await eventually(async () => page.url().includes(`scene=${ids.locket}`))
check('the setup link opens its scene in the editor', true, landed)

check('no uncaught errors', [], errors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
