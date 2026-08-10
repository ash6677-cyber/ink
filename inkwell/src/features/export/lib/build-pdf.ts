/**
 * The print-ready PDF: the layout engine's positioned lines drawn with
 * jsPDF. Times roman throughout — a face every print shop has, embedded
 * in every PDF reader, so the file needs no font payload at all. The
 * geometry all lives in `pdf-layout.ts`; this file only holds the pen.
 */

import { jsPDF } from 'jspdf'

import type { BookChapter } from '@/features/reader/lib/compile-book'
import type { Project } from '@/types'

import { layoutBook, TRADE_6X9, type MeasureFn } from './pdf-layout'
import { sceneToParagraphs } from './serialize'

export async function buildPdf(project: Project, book: BookChapter[]): Promise<Uint8Array> {
  const doc = new jsPDF({
    unit: 'pt',
    format: [TRADE_6X9.width, TRADE_6X9.height],
    compress: true,
  })

  const measure: MeasureFn = (text, size) => {
    doc.setFont('times', 'normal')
    doc.setFontSize(size)
    return doc.getTextWidth(text)
  }

  const chapters = book
    .map((chapter) => {
      const paragraphs: string[] = []
      chapter.scenes.forEach((scene, index) => {
        const body = sceneToParagraphs(scene.content, scene.plainText)
        if (body.length === 0) return
        if (paragraphs.length > 0 && index > 0) paragraphs.push('* * *')
        paragraphs.push(...body)
      })
      return { title: chapter.title, paragraphs }
    })
    .filter((chapter) => chapter.paragraphs.length > 0)

  const pages = layoutBook(
    { title: project.title, author: project.author, chapters },
    TRADE_6X9,
    measure,
  )

  const textWidth = TRADE_6X9.width - TRADE_6X9.margin.inner - TRADE_6X9.margin.outer

  pages.forEach((page, index) => {
    if (index > 0) doc.addPage([TRADE_6X9.width, TRADE_6X9.height])
    for (const line of page.lines) {
      switch (line.style) {
        case 'title':
        case 'chapter-title':
          doc.setFont('times', 'bold')
          break
        case 'byline':
          doc.setFont('times', 'italic')
          break
        default:
          doc.setFont('times', 'normal')
      }
      doc.setFontSize(line.size)
      if (line.align === 'center') {
        doc.text(line.text, line.x, line.y, { align: 'center' })
      } else if (line.align === 'justify' && !line.lastOfParagraph) {
        // Justify by drawing at full measure; jsPDF spreads the spaces.
        doc.text(line.text, line.x, line.y, {
          align: 'justify',
          maxWidth: textWidth - (line.x - TRADE_6X9.margin.inner),
        })
      } else {
        doc.text(line.text, line.x, line.y)
      }
    }
  })

  // Reader-facing niceties: metadata so the file names itself properly.
  doc.setProperties({
    title: project.title,
    author: project.author || undefined,
    creator: 'INKWELL',
  })

  return new Uint8Array(doc.output('arraybuffer'))
}
