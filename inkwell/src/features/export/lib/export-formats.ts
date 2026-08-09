/**
 * The export formats' public face — names, extensions, and the result
 * shape — split from the builders on purpose: the builders drag in the
 * DOCX and EPUB libraries (over a megabyte of source), and this file is
 * imported by the Projects screen at boot just to label a menu. The heavy
 * half (`exporters.ts`) is loaded dynamically the moment an export runs.
 */

export type ExportFormat = 'markdown' | 'text' | 'html' | 'docx' | 'epub'

export interface ExportResult {
  filename: string
  mimeType: string
  /** Text payload, for the formats that are text. */
  text?: string
  /** Binary payload, for DOCX and EPUB. */
  bytes?: Uint8Array
}

export const FORMAT_META: Record<
  ExportFormat,
  { label: string; extension: string; description: string }
> = {
  markdown: {
    label: 'Markdown',
    extension: 'md',
    description: 'Plain text with formatting marks. Good for Git, Obsidian, or further tooling.',
  },
  text: {
    label: 'Plain text',
    extension: 'txt',
    description: 'Just the words, no formatting at all.',
  },
  html: {
    label: 'HTML',
    extension: 'html',
    description: 'A single self-contained web page you can open in any browser or print.',
  },
  docx: {
    label: 'Word (.docx)',
    extension: 'docx',
    description: 'Opens in Word, Pages, and Google Docs. Chapters start on new pages.',
  },
  epub: {
    label: 'EPUB',
    extension: 'epub',
    description: 'A real ebook, readable in Apple Books, Kobo, Calibre, and most e-readers.',
  },
}
