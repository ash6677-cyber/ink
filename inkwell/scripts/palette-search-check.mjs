/**
 * §18 acceptance, through the real UI: the command palette finds words that
 * live in the prose, and the keyboard learns new tricks without forgetting
 * who owns which key.
 *
 * The two promises under test, phrased as the plan phrases them:
 *   - ⌘K "salt road" lists the scene and opens it at the editor — with the
 *     match already highlighted in the find bar, because arriving at the top
 *     of a 4,000-word scene and searching again is not "found".
 *   - Rebinding focus mode to a free key survives a reload; a conflicting
 *     key is refused with the holder named; a bare letter is refused for the
 *     obvious reason.
 *
 *   INKWELL_BASE_PATH=/ npm run build
 *   (cd dist && python3 -m http.server 5410 --bind 127.0.0.1 &)
 *   node scripts/palette-search-check.mjs
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

const browser = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(1200)

// ── A book whose second scene hides the phrase we'll hunt for ───────────────
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
    id: projectId,
    createdAt: now,
    updatedAt: now,
    title: 'The Tide Ledger',
    author: '',
    synopsis: '',
    genre: '',
    targetWordCount: 80000,
    coverId: null,
    seriesId: null,
    seriesOrder: 0,
    status: 'drafting',
    settings: {
      defaultAiPresetId: null,
      pov: 'third-limited',
      tense: 'past',
      measureWidthCh: 68,
      structureMode: 'scenes',
    },
  })
  const chapterId = id('c')
  await put('chapters', {
    id: chapterId,
    createdAt: now,
    updatedAt: now,
    projectId,
    title: 'Chapter 1',
    order: 0,
    status: 'drafting',
  })
  const scene = (order, title, text) => ({
    id: id('s'),
    createdAt: now,
    updatedAt: now,
    projectId,
    chapterId,
    title,
    order,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
    plainText: text,
    wordCount: text.split(/\s+/).length,
    status: 'drafting',
    povCharacterId: null,
    locationCodexId: null,
    summary: '',
    beats: [],
    labels: [],
    linkedCodexIds: [],
  })
  await put(
    'scenes',
    scene(0, 'Harbour Morning', 'The lamps burned low and nobody said a word about the ship.'),
  )
  await put(
    'scenes',
    scene(
      1,
      'The Long Walk',
      'For years afterward nobody spoke of it. They walked the salt road until the light failed and the gulls went silent behind them.',
    ),
  )
  await put('characterCards', {
    id: id('card'),
    createdAt: now,
    updatedAt: now,
    projectId,
    codexEntryId: null,
    displayName: 'Maren Voss',
    avatarImageId: null,
    cropSettings: null,
    description: '',
    personality: '',
    scenario: '',
    firstMessage: '',
    exampleDialogue: [],
    systemPromptOverride: null,
    voiceNotes: '',
    tags: ['keeper'],
  })
  db.close()
  return { projectId }
})

// Open the book so its scenes are the palette's search scope, then leave.
await page.goto(`${BASE}#/editor?project=${projectId}`)
await page.waitForTimeout(1500)
await page.goto(`${BASE}#/projects`)
await page.waitForTimeout(600)

// ── ⌘K, a phrase from the middle of a scene ────────────────────────────────
await page.keyboard.press('Control+k')
await page.waitForTimeout(300)
const paletteInput = page.getByPlaceholder(/Search your book/)
check('the palette opens on Mod+K', true, await paletteInput.isVisible())

await paletteInput.fill('salt road')
await page.waitForTimeout(300)
check('the prose section appears', true, (await page.getByText('In the prose').count()) > 0)
const resultRow = page.getByRole('button', { name: /salt road/i })
check('…with a snippet showing the phrase in context', true, (await resultRow.count()) > 0)
check(
  '…credited to the right scene',
  true,
  (await resultRow.first().textContent()).includes('The Long Walk'),
)

await page.keyboard.press('Enter')
await page.waitForTimeout(1200)
check('choosing it lands in the editor', true, page.url().includes('/editor'))
const findInput = page.getByPlaceholder('Find in scene')
check('the find bar is open', true, await findInput.isVisible())
check('…seeded with the query', 'salt road', await findInput.inputValue())
check('…and the match is already found', true, (await page.getByText('1 of 1').count()) > 0)
// (Focus lives in the find bar — an input — so window.getSelection() can't
// see the editor's selection; "1 of 1" above is the proof the match is live.)
check(
  '…in the scene that actually holds the phrase',
  true,
  (await page.locator('.editor-prose', { hasText: 'salt road' }).count()) > 0,
)

// ── Characters come along too ───────────────────────────────────────────────
await page.keyboard.press('Escape') // close find
await page.keyboard.press('Control+k')
await paletteInput.fill('maren')
await page.waitForTimeout(400)
check('a character card is a palette result', true, (await page.getByText('Characters').count()) > 0)
await page.keyboard.press('Enter')
await page.waitForTimeout(800)
check('…and opens in the Playground', true, page.url().includes('/playground/cards/'))

// ── Rebinding: a free key is accepted and survives a reload ────────────────
await page.goto(`${BASE}#/settings?tab=shortcuts`)
await page.waitForTimeout(800)

const focusRow = page.locator('div.flex.items-start', { hasText: 'Toggle focus mode' })
await focusRow.getByRole('button', { name: 'Change' }).click()
check(
  'capture mode announces itself',
  true,
  (await page.getByText('Press the new keys…').count()) > 0,
)
await page.keyboard.press('Control+m')
await page.waitForTimeout(200)
check(
  'the new keycaps appear on the row',
  true,
  (await focusRow.locator('kbd', { hasText: 'M' }).count()) > 0,
)

// ── A conflicting key is refused, and the refusal names the holder ─────────
const findRow = page.locator('div.flex.items-start', { hasText: 'Find in this scene' })
await findRow.getByRole('button', { name: 'Change' }).click()
await page.keyboard.press('Control+k')
await page.waitForTimeout(200)
check(
  'a taken key is refused with the holder named',
  true,
  (await page.getByText(/already belongs to .Open the command palette./).count()) > 0,
)
check(
  '…and the palette itself never opened over Settings',
  false,
  await paletteInput.isVisible(),
)
check(
  '…and the binding did not change',
  true,
  (await findRow.locator('kbd', { hasText: 'F' }).count()) > 0,
)

// ── A bare letter is refused: it would fire mid-sentence ───────────────────
await findRow.getByRole('button', { name: 'Change' }).click()
await page.keyboard.press('m')
await page.waitForTimeout(200)
check(
  'a bare letter is refused as unusable while typing',
  true,
  (await page.getByText(/would fire while typing/).count()) > 0,
)

// ── The custom binding is real after a reload ───────────────────────────────
await page.reload()
await page.waitForTimeout(1000)
await page.goto(`${BASE}#/editor?project=${projectId}`)
await page.waitForTimeout(1500)

const navRail = page.getByRole('link', { name: 'Projects' })
check('before: the nav rail is visible', true, await navRail.isVisible())
await page.keyboard.press('Control+m')
await page.waitForTimeout(600)
check('Ctrl+M now enters focus mode', false, await navRail.isVisible())
await page.keyboard.press('Control+m')
await page.waitForTimeout(600)
check('…and leaves it again', true, await navRail.isVisible())
await page.keyboard.press('Control+.')
await page.waitForTimeout(600)
check('the abandoned default no longer fires', true, await navRail.isVisible())

// ── Reset returns the key to the book value ────────────────────────────────
await page.goto(`${BASE}#/settings?tab=shortcuts`)
await page.waitForTimeout(800)
await focusRow.getByRole('button', { name: 'Reset' }).click()
await page.waitForTimeout(200)
check(
  'Reset restores the default keycaps',
  true,
  (await focusRow.locator('kbd', { hasText: '.' }).count()) > 0,
)

check('no uncaught errors anywhere along the way', [], pageErrors)

await browser.close()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
