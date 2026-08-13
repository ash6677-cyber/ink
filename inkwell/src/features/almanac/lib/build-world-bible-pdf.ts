/**
 * The world bible's pen: the compiled chapters typeset by the same
 * layout engine as the novel PDF, with portraits drawn into the space
 * the layout reserved. Times roman, 6×9, folios — a document, not a dump.
 */

import { jsPDF } from 'jspdf'

import { layoutBook, TRADE_6X9, type MeasureFn } from '@/features/export/lib/pdf-layout'
import { imageAssetRepo } from '@/lib/db/repositories'
import type { CodexEntry, Project, Scene } from '@/types'

import { compileWorldBible } from './world-bible'

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function buildWorldBiblePdf(input: {
  project: Project
  entries: CodexEntry[]
  scenes: Scene[]
  chapterTitles: Map<string, string>
}): Promise<{ bytes: Uint8Array; filename: string; entryCount: number }> {
  // Portraits first: their true shapes feed the layout.
  const assets = await imageAssetRepo.list()
  const wanted = new Set(input.entries.map((e) => e.imageId).filter(Boolean) as string[])
  const imageSizes = new Map<string, { width: number; height: number }>()
  const imageData = new Map<string, string>()
  for (const asset of assets) {
    if (!wanted.has(asset.id)) continue
    imageSizes.set(asset.id, { width: asset.width, height: asset.height })
    imageData.set(asset.id, await blobToDataUrl(asset.blob))
  }

  const bible = compileWorldBible({ ...input, imageSizes })

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

  const pages = layoutBook(
    { title: bible.title, author: bible.author, chapters: bible.chapters },
    TRADE_6X9,
    measure,
  )
  const textWidth = TRADE_6X9.width - TRADE_6X9.margin.inner - TRADE_6X9.margin.outer

  pages.forEach((page, index) => {
    if (index > 0) doc.addPage([TRADE_6X9.width, TRADE_6X9.height])
    if (page.art) {
      const data = imageData.get(page.art.key)
      if (data) {
        const format = data.startsWith('data:image/png') ? 'PNG' : 'JPEG'
        doc.addImage(data, format, page.art.x, page.art.y, page.art.width, page.art.height)
      }
    }
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
        doc.text(line.text, line.x, line.y, {
          align: 'justify',
          maxWidth: textWidth - (line.x - TRADE_6X9.margin.inner),
        })
      } else {
        doc.text(line.text, line.x, line.y)
      }
    }
  })

  doc.setProperties({
    title: bible.title,
    author: bible.author || undefined,
    creator: 'INKWELL',
  })

  const safe = input.project.title
    .trim()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/\s+/g, '-')
  return {
    bytes: new Uint8Array(doc.output('arraybuffer')),
    filename: `${safe || 'book'}-world-bible.pdf`,
    entryCount: bible.entryCount,
  }
}
