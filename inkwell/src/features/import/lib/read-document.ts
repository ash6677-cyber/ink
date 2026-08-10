import {
  SCENE_BREAK,
  parseMarkdownBlocks,
  type SourceBlock,
} from '@/features/import/lib/parse-manuscript'

/**
 * Getting blocks out of whatever the writer dragged in.
 *
 * A `.docx` is a zip with an XML document inside it, and the one thing that
 * file knows which a text file does not is which paragraphs the author made
 * headings. That is exactly the information chapter detection needs, so it is
 * worth reading properly rather than flattening the file to text and guessing
 * again from scratch.
 */

export type SourceKind = 'markdown' | 'text' | 'docx' | 'scrivener'

export function kindForFile(name: string): SourceKind | null {
  const lower = name.toLowerCase()
  if (lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown'
  if (lower.endsWith('.txt')) return 'text'
  // A Scrivener project is a folder; it arrives here zipped. Some zip
  // tools keep the .scriv name, so both spellings are welcome.
  if (lower.endsWith('.zip') || lower.endsWith('.scriv')) return 'scrivener'
  return null
}

export const ACCEPTED_EXTENSIONS = '.docx,.md,.markdown,.txt,.zip,.scriv'

/** Word's own name for the styles that mean "this is a heading". */
function headingLevelFrom(styleName: string | null): 1 | 2 | null {
  if (!styleName) return null
  const match = /^heading\s*([1-9])$/i.exec(styleName.replace(/[-_]/g, ' ').trim())
  if (!match) return null
  const level = Number(match[1])
  // Anything deeper than two is still a division, but a manuscript has only
  // two that matter; treating heading 3 as a scene is closer than ignoring it.
  return level === 1 ? 1 : 2
}

export async function readDocxBlocks(file: Blob): Promise<SourceBlock[]> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(file)
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml) throw new Error('That .docx has no document inside it.')

  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('That .docx could not be read.')

  const blocks: SourceBlock[] = []
  for (const paragraph of Array.from(doc.getElementsByTagName('w:p'))) {
    // Word splits a sentence across runs whenever formatting changes, so the
    // text of a paragraph is the concatenation of all of them.
    const text = Array.from(paragraph.getElementsByTagName('w:t'))
      .map((node) => node.textContent ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim()

    const style = paragraph
      .getElementsByTagName('w:pStyle')[0]
      ?.getAttribute('w:val')
    const heading = headingLevelFrom(style)
    // Word's Title style is the one thing in the file that says "this is the
    // book, not a part of it" — without it, a title page becomes chapter one.
    const isTitle = /^(title|subtitle)$/i.test((style ?? '').trim())

    if (!text) continue
    if (!heading && !isTitle && /^[*#\-—_\s]{3,}$/.test(text)) {
      blocks.push({ text: SCENE_BREAK, heading: null })
      continue
    }
    blocks.push(isTitle ? { text, heading: null, isTitle: true } : { text, heading })
  }
  return blocks
}

export async function readBlocks(file: File): Promise<SourceBlock[]> {
  const kind = kindForFile(file.name)
  if (kind === 'docx') return readDocxBlocks(file)
  const text = await file.text()
  // Plain text and Markdown go through the same reader: a .txt with `# ` at
  // the start of a line means the same thing to a person either way, and
  // refusing to read it would be pedantry rather than accuracy.
  return parseMarkdownBlocks(text)
}
