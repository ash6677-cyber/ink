import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'
import JSZip from 'jszip'

import type { BookChapter } from '@/features/reader/lib/compile-book'
import {
  escapeHtml,
  sceneToHtml,
  sceneToMarkdown,
  sceneToParagraphs,
} from '@/features/export/lib/serialize'
import type { Project } from '@/types'

import { FORMAT_META, type ExportFormat, type ExportResult } from './export-formats'

export { FORMAT_META, type ExportFormat, type ExportResult }

function safeFilename(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/\s+/g, '-')
  return cleaned.length > 0 ? cleaned : 'manuscript'
}

/** Chapters with no prose at all are skipped: an empty chapter is a
 * placeholder in the editor, not something a reader should meet. */
function withProse(book: BookChapter[]): BookChapter[] {
  return book.filter((chapter) =>
    chapter.scenes.some((scene) => scene.plainText.trim().length > 0 || scene.content),
  )
}

function buildMarkdown(project: Project, book: BookChapter[]): string {
  const parts: string[] = [`# ${project.title}`]
  if (project.author) parts.push(`*by ${project.author}*`)
  if (project.synopsis.trim()) parts.push(project.synopsis.trim())

  for (const chapter of withProse(book)) {
    parts.push(`\n## ${chapter.title}`)
    chapter.scenes.forEach((scene, index) => {
      if (index > 0) parts.push('* * *')
      const body = sceneToMarkdown(scene.content, scene.plainText)
      if (body) parts.push(body)
    })
  }
  return `${parts.join('\n\n')}\n`
}

function buildPlainText(project: Project, book: BookChapter[]): string {
  const parts: string[] = [project.title]
  if (project.author) parts.push(`by ${project.author}`)

  for (const chapter of withProse(book)) {
    parts.push(`\n\n${chapter.title.toUpperCase()}`)
    chapter.scenes.forEach((scene, index) => {
      if (index > 0) parts.push('* * *')
      const body = sceneToParagraphs(scene.content, scene.plainText).join('\n\n')
      if (body) parts.push(body)
    })
  }
  return `${parts.join('\n\n')}\n`
}

const PRINT_CSS = `
  body { max-width: 34em; margin: 4rem auto; padding: 0 1.5rem;
         font-family: Georgia, 'Times New Roman', serif; line-height: 1.7; color: #1b1b1b; }
  h1 { text-align: center; font-size: 2rem; margin-bottom: 0.25em; }
  .byline { text-align: center; font-style: italic; margin-top: 0; color: #555; }
  h2 { margin-top: 3.5rem; text-align: center; font-size: 1.35rem; page-break-before: always; }
  h2:first-of-type { page-break-before: avoid; }
  p { margin: 0; text-indent: 1.4em; text-align: justify; }
  h1 + p, h2 + p, .break + p { text-indent: 0; }
  .break { text-align: center; margin: 1.6em 0; color: #777; }
  @media print { body { margin: 0 auto; } }
`

function buildHtml(project: Project, book: BookChapter[]): string {
  const body: string[] = [`<h1>${escapeHtml(project.title)}</h1>`]
  if (project.author) body.push(`<p class="byline">by ${escapeHtml(project.author)}</p>`)

  for (const chapter of withProse(book)) {
    body.push(`<h2>${escapeHtml(chapter.title)}</h2>`)
    chapter.scenes.forEach((scene, index) => {
      if (index > 0) body.push('<p class="break">* * *</p>')
      body.push(sceneToHtml(scene.content, scene.plainText))
    })
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(project.title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
${body.join('\n')}
</body>
</html>
`
}

async function buildDocx(project: Project, book: BookChapter[]): Promise<Uint8Array> {
  const children: Paragraph[] = [
    new Paragraph({
      text: project.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
  ]
  if (project.author) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `by ${project.author}`, italics: true })],
      }),
    )
  }

  withProse(book).forEach((chapter, chapterIndex) => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        // Manuscript convention: every chapter opens on a fresh page.
        pageBreakBefore: chapterIndex > 0,
        spacing: { before: 480, after: 360 },
        children: [new TextRun(chapter.title)],
      }),
    )

    chapter.scenes.forEach((scene, sceneIndex) => {
      if (sceneIndex > 0) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 240 },
            children: [new TextRun('* * *')],
          }),
        )
      }
      for (const text of sceneToParagraphs(scene.content, scene.plainText)) {
        children.push(
          new Paragraph({
            indent: { firstLine: 420 },
            spacing: { line: 360 },
            children: [new TextRun(text)],
          }),
        )
      }
    })
  })

  // Guard against a completely empty manuscript: docx rejects a section
  // with no children at all.
  if (children.length === 0) children.push(new Paragraph(''))

  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  return new Uint8Array(await blob.arrayBuffer())
}

const EPUB_CSS = `
  body { font-family: serif; line-height: 1.6; margin: 1em; }
  h1 { text-align: center; margin: 2em 0 1em; }
  p { margin: 0; text-indent: 1.4em; text-align: justify; }
  h1 + p, .break + p { text-indent: 0; }
  .break { text-align: center; margin: 1.4em 0; }
`

async function buildEpub(project: Project, book: BookChapter[]): Promise<Uint8Array> {
  const zip = new JSZip()
  const chapters = withProse(book)
  const uid = `urn:uuid:${crypto.randomUUID()}`
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

  // The mimetype entry must be first and stored uncompressed — readers
  // identify the container by reading it at a fixed byte offset.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  )

  zip.file('OEBPS/style.css', EPUB_CSS)

  chapters.forEach((chapter, index) => {
    const body = chapter.scenes
      .map(
        (scene, sceneIndex) =>
          (sceneIndex > 0 ? '<p class="break">* * *</p>\n' : '') +
          sceneToHtml(scene.content, scene.plainText),
      )
      .join('\n')

    zip.file(
      `OEBPS/chapter-${index + 1}.xhtml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
  <title>${escapeHtml(chapter.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1>${escapeHtml(chapter.title)}</h1>
${body}
</body>
</html>`,
    )
  })

  const navItems = chapters
    .map(
      (chapter, index) =>
        `      <li><a href="chapter-${index + 1}.xhtml">${escapeHtml(chapter.title)}</a></li>`,
    )
    .join('\n')

  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head><title>Contents</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
${navItems}
    </ol>
  </nav>
</body>
</html>`,
  )

  const manifest = chapters
    .map(
      (_, index) =>
        `    <item id="chapter-${index + 1}" href="chapter-${index + 1}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .join('\n')
  const spine = chapters
    .map((_, index) => `    <itemref idref="chapter-${index + 1}"/>`)
    .join('\n')

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${uid}</dc:identifier>
    <dc:title>${escapeHtml(project.title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>${escapeHtml(project.author || 'Unknown')}</dc:creator>
    <meta property="dcterms:modified">${now}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style" href="style.css" media-type="text/css"/>
${manifest}
  </manifest>
  <spine>
${spine}
  </spine>
</package>`,
  )

  const blob = await zip.generateAsync({ type: 'uint8array', mimeType: 'application/epub+zip' })
  return blob
}

export async function buildExport(
  format: ExportFormat,
  project: Project,
  book: BookChapter[],
): Promise<ExportResult> {
  const base = safeFilename(project.title)
  const meta = FORMAT_META[format]
  const filename = `${base}.${meta.extension}`

  switch (format) {
    case 'markdown':
      return { filename, mimeType: 'text/markdown', text: buildMarkdown(project, book) }
    case 'text':
      return { filename, mimeType: 'text/plain', text: buildPlainText(project, book) }
    case 'html':
      return { filename, mimeType: 'text/html', text: buildHtml(project, book) }
    case 'docx':
      return {
        filename,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bytes: await buildDocx(project, book),
      }
    case 'epub':
      return {
        filename,
        mimeType: 'application/epub+zip',
        bytes: await buildEpub(project, book),
      }
    case 'pdf': {
      // jsPDF rides in only when a PDF is actually asked for.
      const { buildPdf } = await import('./build-pdf')
      return {
        filename,
        mimeType: 'application/pdf',
        bytes: await buildPdf(project, book),
      }
    }
  }
}
