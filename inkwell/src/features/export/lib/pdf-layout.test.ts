import { describe, expect, it } from 'vitest'

import {
  layoutBook,
  TRADE_6X9,
  wrapParagraph,
  type MeasureFn,
  type PdfChapterInput,
} from '@/features/export/lib/pdf-layout'

// A ruler with no font in sight: every character 6pt wide at size 11,
// scaled linearly with size. Deterministic and good enough for geometry.
const measure: MeasureFn = (text, size) => text.length * 6 * (size / 11)

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')

function layout(chapters: PdfChapterInput[]) {
  return layoutBook({ title: 'The Book', author: 'A. Writer', chapters }, TRADE_6X9, measure)
}

describe('wrapParagraph', () => {
  it('never drops a word', () => {
    const text = words(120)
    const lines = wrapParagraph(text, 298, 11, measure, 18)
    expect(lines.join(' ')).toBe(text)
  })

  it('leaves room for the first-line indent', () => {
    const lines = wrapParagraph(words(40), 298, 11, measure, 18)
    expect(measure(lines[0], 11)).toBeLessThanOrEqual(298 - 18)
    for (const line of lines.slice(1)) {
      expect(measure(line, 11)).toBeLessThanOrEqual(298)
    }
  })

  it('handles the empty paragraph', () => {
    expect(wrapParagraph('   ', 298, 11, measure, 0)).toEqual([])
  })
})

describe('layoutBook', () => {
  it('opens with an unnumbered title page', () => {
    const pages = layout([{ title: 'One', paragraphs: ['Hello there.'] }])
    expect(pages[0].folio).toBeUndefined()
    expect(pages[0].lines.some((l) => l.style === 'title' && l.text === 'The Book')).toBe(true)
    expect(pages[0].lines.some((l) => l.style === 'byline' && l.text === 'A. Writer')).toBe(true)
  })

  it('starts every chapter on a fresh numbered page', () => {
    const pages = layout([
      { title: 'One', paragraphs: ['First.'] },
      { title: 'Two', paragraphs: ['Second.'] },
    ])
    const openers = pages.filter((p) => p.lines.some((l) => l.style === 'chapter-title'))
    expect(openers).toHaveLength(2)
    expect(openers[0].folio).toBe(1)
    expect(openers[1].folio).toBe(2)
    // The opener page carries only its own chapter's title.
    expect(
      openers[1].lines.find((l) => l.style === 'chapter-title')?.text,
    ).toBe('Two')
  })

  it('flows a long chapter across pages with continuous folios', () => {
    const pages = layout([
      { title: 'Long', paragraphs: Array.from({ length: 30 }, () => words(60)) },
    ])
    expect(pages.length).toBeGreaterThan(3)
    const folios = pages.filter((p) => p.folio).map((p) => p.folio)
    expect(folios).toEqual(Array.from({ length: folios.length }, (_, i) => i + 1))
    // No body line below the text area on any page.
    const bottom = TRADE_6X9.height - TRADE_6X9.margin.bottom
    for (const page of pages) {
      for (const line of page.lines) {
        if (line.style === 'body') expect(line.y).toBeLessThanOrEqual(bottom + TRADE_6X9.leading)
      }
    }
  })

  it('indents paragraphs except the first after a heading or break', () => {
    const pages = layout([
      { title: 'One', paragraphs: ['First paragraph.', 'Second paragraph.', '* * *', 'After the break.'] },
    ])
    const bodyLines = pages.flatMap((p) => p.lines).filter((l) => l.style === 'body')
    const left = TRADE_6X9.margin.inner
    expect(bodyLines).toHaveLength(3) // one line per short paragraph
    expect(bodyLines[0].x).toBe(left) // flush after the chapter title
    expect(bodyLines[1].x).toBe(left + 18) // indented
    expect(bodyLines[2].x).toBe(left) // flush after the scene break
    expect(pages.flatMap((p) => p.lines).some((l) => l.style === 'break')).toBe(true)
  })

  it('marks the last line of each paragraph so justification can go ragged', () => {
    const pages = layout([{ title: 'One', paragraphs: [words(80)] }])
    const body = pages.flatMap((p) => p.lines).filter((l) => l.style === 'body')
    expect(body.at(-1)?.lastOfParagraph).toBe(true)
    expect(body.slice(0, -1).every((l) => !l.lastOfParagraph)).toBe(true)
  })

  it('never strands a scene break as the last line of a page', () => {
    // Enough text that a break lands near a page bottom somewhere.
    const chapters = [
      {
        title: 'One',
        paragraphs: Array.from({ length: 40 }, (_, i) =>
          i % 3 === 2 ? '* * *' : words(55),
        ),
      },
    ]
    const pages = layout(chapters)
    for (const page of pages) {
      const printable = page.lines.filter((l) => l.style !== 'folio')
      const last = printable.at(-1)
      expect(last?.style === 'break').toBe(false)
    }
  })
})

describe('chapter art', () => {
  it('reserves the art box under the title and pushes text below it', () => {
    const withArt = layout([
      { title: 'Marta', paragraphs: ['She keeps the ford.'], art: { key: 'img-1', width: 124, height: 186 } },
    ])
    const artPage = withArt.find((p) => p.art)
    expect(artPage?.art?.key).toBe('img-1')
    // Centered on the 432pt page.
    expect(artPage!.art!.x).toBeCloseTo(432 / 2 - 124 / 2)
    const firstBody = artPage!.lines.find((l) => l.style === 'body')!
    expect(firstBody.y).toBeGreaterThan(artPage!.art!.y + artPage!.art!.height)

    // The same chapter without art starts its text higher up the page.
    const without = layout([{ title: 'Marta', paragraphs: ['She keeps the ford.'] }])
    const plainBody = without
      .flatMap((p) => p.lines)
      .find((l) => l.style === 'body')!
    expect(plainBody.y).toBeLessThan(firstBody.y)
  })

  it('shrinks art wider than the measure to fit, keeping its shape', () => {
    const pages = layout([
      { title: 'Map', paragraphs: ['x'], art: { key: 'map', width: 600, height: 300 } },
    ])
    const art = pages.find((p) => p.art)!.art!
    const textWidth = 432 - 76 - 58
    expect(art.width).toBe(textWidth)
    expect(art.height).toBeCloseTo(300 * (textWidth / 600))
  })
})
