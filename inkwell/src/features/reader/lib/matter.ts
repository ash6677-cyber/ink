import type { BookMatter, Scene } from '@/types'

import type { BookChapter } from './compile-book'

/**
 * Front & back matter as real sections of the compiled book.
 *
 * The trick that makes matter flow everywhere at once: dedication,
 * epigraph, acknowledgments and about-the-author become synthetic
 * `BookChapter`s wrapped around the story. Every consumer of a compiled
 * book — the page-flip reader, all six export formats, published shares —
 * then carries them with no format-specific work: EPUB gives each its own
 * section, DOCX and PDF their own page, shares their own chapter document.
 *
 * Their word counts are pinned to zero on purpose so a dedication never
 * inflates the manuscript's honest length.
 */

export function emptyMatter(): BookMatter {
  return {
    dedication: '',
    epigraph: '',
    epigraphAttribution: '',
    acknowledgments: '',
    aboutAuthor: '',
  }
}

/** A missing or partial record reads as empty sections, never undefined. */
export function normalizeMatter(raw: Partial<BookMatter> | null | undefined): BookMatter {
  return { ...emptyMatter(), ...(raw ?? {}) }
}

export function hasAnyMatter(raw: Partial<BookMatter> | null | undefined): boolean {
  const matter = normalizeMatter(raw)
  return (
    matter.dedication.trim().length > 0 ||
    matter.epigraph.trim().length > 0 ||
    matter.acknowledgments.trim().length > 0 ||
    matter.aboutAuthor.trim().length > 0
  )
}

/** Ids the matter sections use, stable so shares republish over themselves. */
export const MATTER_IDS = {
  dedication: 'matter-dedication',
  epigraph: 'matter-epigraph',
  acknowledgments: 'matter-acknowledgments',
  aboutAuthor: 'matter-about-the-author',
} as const

/** Whether a compiled chapter is one of the synthetic matter sections. */
export function isMatterChapter(id: string): boolean {
  return Object.values(MATTER_IDS).includes(id as (typeof MATTER_IDS)[keyof typeof MATTER_IDS])
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function matterScene(id: string, texts: string[]): Scene {
  const plainText = texts.join('\n\n')
  return {
    id: `${id}-scene`,
    createdAt: 0,
    updatedAt: 0,
    chapterId: id,
    projectId: '',
    title: '',
    order: 0,
    content: {
      type: 'doc',
      content: texts.map((text) => ({
        type: 'paragraph',
        content: [{ type: 'text', text }],
      })),
    },
    plainText,
    // Zero on purpose: matter never counts toward the manuscript's length.
    wordCount: 0,
    status: 'done',
    povCharacterId: null,
    locationCodexId: null,
    summary: '',
    beats: [],
    labels: [],
    linkedCodexIds: [],
  }
}

function matterChapter(id: string, title: string, texts: string[]): BookChapter {
  return {
    id,
    title,
    kind: 'interlude',
    // Unnumbered by construction — a dedication is not chapter one.
    number: null,
    scenes: [matterScene(id, texts)],
    wordCount: 0,
  }
}

/**
 * Wraps the compiled story in its matter: dedication and epigraph before
 * the first chapter, acknowledgments and about-the-author after the last.
 * Empty sections simply don't appear; empty matter returns the book as-is.
 */
export function withMatter(
  book: BookChapter[],
  raw: Partial<BookMatter> | null | undefined,
): BookChapter[] {
  const matter = normalizeMatter(raw)
  const front: BookChapter[] = []
  const back: BookChapter[] = []

  if (matter.dedication.trim()) {
    front.push(matterChapter(MATTER_IDS.dedication, 'Dedication', paragraphs(matter.dedication)))
  }
  if (matter.epigraph.trim()) {
    const texts = paragraphs(matter.epigraph)
    if (matter.epigraphAttribution.trim()) {
      texts.push(`— ${matter.epigraphAttribution.trim()}`)
    }
    front.push(matterChapter(MATTER_IDS.epigraph, 'Epigraph', texts))
  }
  if (matter.acknowledgments.trim()) {
    back.push(
      matterChapter(
        MATTER_IDS.acknowledgments,
        'Acknowledgments',
        paragraphs(matter.acknowledgments),
      ),
    )
  }
  if (matter.aboutAuthor.trim()) {
    back.push(
      matterChapter(MATTER_IDS.aboutAuthor, 'About the Author', paragraphs(matter.aboutAuthor)),
    )
  }

  if (front.length === 0 && back.length === 0) return book
  return [...front, ...book, ...back]
}
