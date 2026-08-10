/**
 * Print typesetting as arithmetic.
 *
 * A novel page is a set of conventions: a 6×9 inch trade page, chapters
 * opening a third of the way down a fresh page, first-line indents except
 * after a heading or a scene break, folios in the footer, and no chapter
 * title stranded at the bottom of a page. This lays all of that out as
 * pure data — positioned lines — with the text measurer injected, so the
 * geometry is testable without a PDF library in sight. The renderer just
 * walks the result and draws.
 */

export interface PdfPageMetrics {
  /** Page size in points (72/inch). Default is the 6×9in trade novel. */
  width: number
  height: number
  margin: { top: number; bottom: number; inner: number; outer: number }
  bodySize: number
  leading: number
  chapterSize: number
  folioSize: number
}

export const TRADE_6X9: PdfPageMetrics = {
  width: 432,
  height: 648,
  margin: { top: 72, bottom: 72, inner: 76, outer: 58 },
  bodySize: 11,
  leading: 16,
  chapterSize: 20,
  folioSize: 9,
}

export interface PdfLine {
  text: string
  x: number
  y: number
  size: number
  style: 'body' | 'chapter-title' | 'title' | 'byline' | 'folio' | 'break'
  align: 'left' | 'center' | 'justify'
  /** Justified paragraphs still set their last line ragged. */
  lastOfParagraph?: boolean
}

export interface PdfPage {
  lines: PdfLine[]
  /** Printed page number, when this page carries a folio. */
  folio?: number
}

export interface PdfChapterInput {
  title: string
  /** Paragraphs in order; a scene break is the literal '* * *'. */
  paragraphs: string[]
}

export type MeasureFn = (text: string, size: number) => number

const INDENT = 18
const SCENE_BREAK = '* * *'

/** Greedy word wrap against a real measurer. Never drops a word. */
export function wrapParagraph(
  text: string,
  maxWidth: number,
  size: number,
  measure: MeasureFn,
  firstLineIndent: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const width = maxWidth - (lines.length === 0 ? firstLineIndent : 0)
    const candidate = line === '' ? word : `${line} ${word}`
    if (line !== '' && measure(candidate, size) > width) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line !== '') lines.push(line)
  return lines
}

export function layoutBook(
  input: {
    title: string
    author: string
    chapters: PdfChapterInput[]
  },
  metrics: PdfPageMetrics,
  measure: MeasureFn,
): PdfPage[] {
  const m = metrics
  const textWidth = m.width - m.margin.inner - m.margin.outer
  const textLeft = m.margin.inner
  const textBottom = m.height - m.margin.bottom
  const center = m.width / 2

  const pages: PdfPage[] = []

  // ---- Title page: no folio, never counted in the visible numbering. ----
  pages.push({
    lines: [
      {
        text: input.title,
        x: center,
        y: m.height * 0.38,
        size: m.chapterSize + 6,
        style: 'title',
        align: 'center',
      },
      ...(input.author
        ? [
            {
              text: input.author,
              x: center,
              y: m.height * 0.38 + 40,
              size: m.bodySize + 1,
              style: 'byline' as const,
              align: 'center' as const,
            },
          ]
        : []),
    ],
  })

  let page: PdfPage = { lines: [] }
  let y = 0
  let folio = 0

  const openPage = () => {
    folio += 1
    page = { lines: [], folio }
    page.lines.push({
      text: String(folio),
      x: center,
      y: m.height - m.margin.bottom / 2,
      size: m.folioSize,
      style: 'folio',
      align: 'center',
    })
    y = m.margin.top
  }

  const commit = () => {
    if (page.lines.length > 0) pages.push(page)
  }

  for (const chapter of input.chapters) {
    // A chapter opens on its own fresh page, a third of the way down.
    commit()
    openPage()
    y = m.height * 0.3
    page.lines.push({
      text: chapter.title,
      x: center,
      y,
      size: m.chapterSize,
      style: 'chapter-title',
      align: 'center',
    })
    y += m.leading * 2.5

    let afterBreak = true // the first paragraph after a heading sits flush
    for (const paragraph of chapter.paragraphs) {
      if (paragraph.trim() === SCENE_BREAK) {
        // A scene break needs the break line plus at least one line after
        // it on the same page — a break as the last line reads as an end.
        if (y + m.leading * 2 > textBottom) {
          commit()
          openPage()
        } else {
          y += m.leading * 0.5
        }
        page.lines.push({
          text: SCENE_BREAK,
          x: center,
          y,
          size: m.bodySize,
          style: 'break',
          align: 'center',
        })
        y += m.leading * 1.5
        afterBreak = true
        continue
      }

      const indent = afterBreak ? 0 : INDENT
      const wrapped = wrapParagraph(paragraph, textWidth, m.bodySize, measure, indent)
      wrapped.forEach((text, index) => {
        if (y > textBottom) {
          commit()
          openPage()
        }
        page.lines.push({
          text,
          x: textLeft + (index === 0 ? indent : 0),
          y,
          size: m.bodySize,
          style: 'body',
          align: 'justify',
          lastOfParagraph: index === wrapped.length - 1,
        })
        y += m.leading
      })
      afterBreak = false
    }
  }
  commit()

  return pages
}
