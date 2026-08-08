/**
 * §24 acceptance: the app survives hostile browsers, and every route passes
 * an axe accessibility scan with zero critical violations.
 *
 * The storage check simulates the browser that hurts most: one where
 * IndexedDB is simply gone (hardened private windows, locked-down
 * profiles). The promise is an explanation instead of a white page —
 * "where is my book?" must always have an answer on screen.
 *
 *   INKWELL_BASE_PATH=/ npm run build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/robustness-check.mjs
 */
import { readFileSync } from 'node:fs'

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? '/opt/node22/lib/node_modules/playwright/index.mjs'
)
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5410/'
const AXE_SOURCE = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8')

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

// ── A browser with no IndexedDB at all ──────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  await ctx.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { get: () => undefined })
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}#/projects`)
  await page.waitForTimeout(2500)

  check(
    'blocked storage lands on an explanation, not a white page',
    true,
    (await page.getByText('This browser is blocking INKWELL’s storage').count()) > 0,
  )
  check(
    '…that says plainly nothing has been lost',
    true,
    (await page.getByText('Nothing has been lost.').count()) > 0,
  )
  check(
    '…with export/import guidance for a backup file',
    true,
    (await page.getByText(/Settings → Data → Export/).count()) > 0,
  )
  check(
    '…and a way to try again',
    true,
    await page.getByRole('button', { name: 'Try again' }).isVisible(),
  )
  const bodyText = (await page.locator('body').innerText()).trim()
  check('the page is genuinely not blank', true, bodyText.length > 100)
  await ctx.close()
}

// ── Axe, on every route a writer can reach ──────────────────────────────────
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(1200)

// A seeded book makes editor/almanac/reader scans meaningful.
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
  const chapterId = id('c')
  await put('chapters', { id: chapterId, createdAt: now, updatedAt: now, projectId, title: 'Chapter 1', order: 0, status: 'drafting' })
  const text = 'They walked the salt road until the light failed.'
  await put('scenes', {
    id: id('s'), createdAt: now, updatedAt: now, projectId, chapterId, title: 'The Long Walk',
    order: 0, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
    plainText: text, wordCount: 9, status: 'drafting', povCharacterId: null, locationCodexId: null,
    summary: '', beats: [], labels: [], linkedCodexIds: [],
  })
  db.close()
  return { projectId }
})

const routes = [
  ['Projects', `#/projects`],
  ['Editor', `#/editor?project=${projectId}`],
  ['Read', `#/read?project=${projectId}`],
  ['Almanac', `#/almanac?project=${projectId}`],
  ['Playground · Cards', `#/playground/cards?project=${projectId}`],
  ['Playground · Chats', `#/playground/chats?project=${projectId}`],
  ['Planning', `#/planning?project=${projectId}`],
  ['Cover Studio', `#/covers?project=${projectId}`],
  ['Series', `#/series`],
  ['Stats', `#/stats?project=${projectId}`],
  ['Settings', `#/settings`],
  ['Settings · Shortcuts', `#/settings?tab=shortcuts`],
]

for (const [name, hash] of routes) {
  await page.goto(`${BASE}${hash}`)
  await page.waitForTimeout(1400)
  await page.evaluate(AXE_SOURCE)
  const result = await page.evaluate(async () => {
    const res = await window.axe.run(document, {
      resultTypes: ['violations'],
      // Color contrast is governed by the theme engine and checked by its
      // own probe; axe's static check misfires on layered translucency.
      rules: { 'color-contrast': { enabled: false } },
    })
    return res.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
      sample: v.nodes[0]?.target?.join(' ') ?? '',
    }))
  })
  const critical = result.filter((v) => v.impact === 'critical')
  const serious = result.filter((v) => v.impact === 'serious')
  check(`axe · ${name} · zero critical violations`, [], critical)
  if (serious.length > 0)
    console.log(`     (${name}: ${serious.length} serious — ${serious.map((v) => `${v.id}×${v.nodes}`).join(', ')})`)
}

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
