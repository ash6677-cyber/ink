/**
 * Reading a Scrivener project.
 *
 * A `.scriv` is a folder: `project.scrivx` is an XML binder naming every
 * document, and each document's words live in their own RTF file under
 * `Files/Data/<UUID>/content.rtf` (Scrivener 3) or `Files/Docs/<ID>.rtf`
 * (Scrivener 2). Browsers can't upload folders, so we accept the folder
 * zipped and read both generations.
 *
 * The binder is parsed with a small hand tokenizer because the test
 * runner has no DOMParser — and the scrivx schema needed here is tiny:
 * BinderItem elements, their attributes, their Titles, their nesting.
 */

import {
  countWords,
  type DetectedChapter,
  type DetectedManuscript,
  type DetectedScene,
} from '@/features/import/lib/parse-manuscript'
import { rtfToParagraphs } from '@/features/import/lib/rtf-text'

export interface ScrivItem {
  /** UUID (Scrivener 3) or numeric ID (Scrivener 2). */
  id: string
  type: string
  title: string
  /** False when the writer excluded it from Compile. */
  inCompile: boolean
  children: ScrivItem[]
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
}

function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m)
}

/** Parse the binder out of a scrivx file. Returns every root-level item. */
export function parseScrivx(xml: string): ScrivItem[] {
  const roots: ScrivItem[] = []
  const stack: ScrivItem[] = []
  // Tags we care about: BinderItem (nesting), Title (text), IncludeInCompile.
  const tag = /<(\/?)([A-Za-z][\w-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|<!--[\s\S]*?-->/g
  let match: RegExpExecArray | null
  let lastIndex = 0
  let textTarget: 'title' | 'compile' | null = null

  while ((match = tag.exec(xml)) !== null) {
    const [whole, closing, name, attrs, selfClose] = match
    if (whole.startsWith('<!--')) continue

    // Text between the previous tag and this one.
    const text = xml.slice(lastIndex, match.index)
    lastIndex = match.index + whole.length
    const owner = stack[stack.length - 1]
    if (owner && textTarget === 'title' && text.trim()) owner.title = decodeXml(text.trim())
    if (owner && textTarget === 'compile' && text.trim()) {
      owner.inCompile = !/^(no|false|0)$/i.test(text.trim())
    }
    textTarget = null

    if (name === 'BinderItem') {
      if (closing) {
        const done = stack.pop()
        if (done && stack.length === 0) roots.push(done)
        else if (done && stack.length > 0) stack[stack.length - 1].children.push(done)
        continue
      }
      const attrMap: Record<string, string> = {}
      for (const [, key, value] of attrs.matchAll(/([\w:-]+)="([^"]*)"/g)) {
        attrMap[key] = decodeXml(value)
      }
      const item: ScrivItem = {
        id: attrMap.UUID ?? attrMap.ID ?? '',
        type: attrMap.Type ?? '',
        title: '',
        inCompile: true,
        children: [],
      }
      if (selfClose) {
        if (stack.length === 0) roots.push(item)
        else stack[stack.length - 1].children.push(item)
      } else {
        stack.push(item)
      }
      continue
    }
    if (!closing && name === 'Title') textTarget = 'title'
    if (!closing && name === 'IncludeInCompile') textTarget = 'compile'
  }
  return roots
}

/** The manuscript root: the DraftFolder, wherever it sits. */
export function findDraft(roots: ScrivItem[]): ScrivItem | null {
  const walk = (items: ScrivItem[]): ScrivItem | null => {
    for (const item of items) {
      if (/^draft/i.test(item.type)) return item
      const found = walk(item.children)
      if (found) return found
    }
    return null
  }
  return (
    walk(roots) ??
    roots.find((r) => /^(manuscript|draft)$/i.test(r.title)) ??
    null
  )
}

/**
 * The binder mapped onto chapters and scenes: a folder under the draft is
 * a chapter, the text documents inside it (at any depth, in order) are its
 * scenes, and a loose text document at the draft root is a one-scene
 * chapter. Anything excluded from Compile stays behind, same as Scrivener
 * itself would leave it.
 */
export function binderToManuscript(
  draft: ScrivItem,
  readBody: (item: ScrivItem) => string[],
  projectTitle: string,
): DetectedManuscript {
  const texts = (item: ScrivItem): ScrivItem[] => {
    const out: ScrivItem[] = []
    const walk = (x: ScrivItem) => {
      if (!x.inCompile) return
      if (/text/i.test(x.type)) out.push(x)
      x.children.forEach(walk)
    }
    item.children.forEach(walk)
    if (/text/i.test(item.type) && item.inCompile && out.length === 0) out.push(item)
    return out
  }

  const chapters: DetectedChapter[] = []
  for (const child of draft.children) {
    if (!child.inCompile) continue
    const docs = /text/i.test(child.type) ? [child] : texts(child)
    const scenes: DetectedScene[] = []
    for (const doc of docs) {
      const paragraphs = readBody(doc)
      if (paragraphs.length === 0) continue
      scenes.push({
        title: doc.title || `Scene ${scenes.length + 1}`,
        paragraphs,
        wordCount: countWords(paragraphs.join(' ')),
      })
    }
    if (scenes.length === 0) continue
    chapters.push({
      title: child.title || `Chapter ${chapters.length + 1}`,
      scenes,
      wordCount: scenes.reduce((sum, s) => sum + s.wordCount, 0),
    })
  }

  return {
    chapters,
    method: 'binder',
    wordCount: chapters.reduce((sum, c) => sum + c.wordCount, 0),
    title: projectTitle,
  }
}

/** The IO shell: find the scrivx in the zip, read each document's RTF. */
export async function readScrivenerArchive(file: Blob): Promise<DetectedManuscript> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(file)

  const scrivxPath = Object.keys(zip.files).find(
    (path) => path.toLowerCase().endsWith('.scrivx') && !path.startsWith('__MACOSX'),
  )
  if (!scrivxPath) {
    throw new Error(
      'No Scrivener project found inside. Zip your whole .scriv folder (the .scrivx file and Files folder together) and try again.',
    )
  }
  const base = scrivxPath.slice(0, scrivxPath.lastIndexOf('/') + 1)
  const xml = await zip.file(scrivxPath)!.async('string')
  const roots = parseScrivx(xml)
  const draft = findDraft(roots)
  if (!draft) throw new Error('That Scrivener project has no Draft folder in its binder.')

  // Pre-read every document body so the mapping itself can stay pure.
  const bodies = new Map<string, string[]>()
  const collect: ScrivItem[] = []
  const walk = (item: ScrivItem) => {
    collect.push(item)
    item.children.forEach(walk)
  }
  walk(draft)
  for (const item of collect) {
    if (!/text/i.test(item.type) || !item.id) continue
    const candidates = [
      `${base}Files/Data/${item.id}/content.rtf`,
      `${base}Files/Docs/${item.id}.rtf`,
    ]
    for (const path of candidates) {
      const entry = zip.file(path)
      if (entry) {
        bodies.set(item.id, rtfToParagraphs(await entry.async('string')))
        break
      }
    }
  }

  const projectTitle = scrivxPath
    .split('/')
    .pop()!
    .replace(/\.scrivx$/i, '')
  return binderToManuscript(draft, (item) => bodies.get(item.id) ?? [], projectTitle)
}
