import type { PdfChapterInput } from '@/features/export/lib/pdf-layout'
import type { CodexEntry, CodexEntryType, Project, Scene } from '@/types'

/**
 * The world bible: the Almanac compiled into a document of its own.
 *
 * Series writers keep these open constantly; agents and co-writers ask
 * for them. This lays the whole Almanac out as chapters for the existing
 * PDF typesetting engine — a section opener per kind (characters, places,
 * …), an entry per page with its portrait, attributes and relationships,
 * then the relationship web and the story's day-by-day timeline at the
 * back. Pure compilation; the pen lives elsewhere.
 */

export interface WorldBibleChapter extends PdfChapterInput {
  /** The imageAssets id behind this chapter's art key, when it has one. */
  imageId?: string
}

export interface WorldBible {
  title: string
  author: string
  chapters: WorldBibleChapter[]
  /** Entries counted into the bible, for the button's honesty. */
  entryCount: number
}

const SECTION_ORDER: CodexEntryType[] = [
  'character', 'location', 'faction', 'item', 'lore', 'concept', 'other',
]

const SECTION_TITLE: Record<CodexEntryType, string> = {
  character: 'Characters',
  location: 'Places',
  faction: 'Factions',
  item: 'Items',
  lore: 'Lore',
  concept: 'Concepts',
  other: 'Miscellany',
}

/** Portrait box in points — trade-page friendly, ~1.7in square. */
export const PORTRAIT_BOX = 124

function entryParagraphs(entry: CodexEntry, nameById: Map<string, string>): string[] {
  const paragraphs: string[] = []
  if (entry.aliases.length > 0) paragraphs.push(`Also known as ${entry.aliases.join(', ')}.`)
  if (entry.summary.trim()) paragraphs.push(entry.summary.trim())

  for (const attribute of entry.attributes) {
    if (attribute.key.trim() || attribute.value.trim()) {
      paragraphs.push(`${attribute.key.trim()}: ${attribute.value.trim()}`)
    }
  }

  for (const relationship of entry.relationships) {
    const target = nameById.get(relationship.targetEntryId)
    if (!target) continue
    paragraphs.push(
      relationship.label.trim()
        ? `${relationship.label.trim()} - ${target}`
        : `Connected to ${target}`,
    )
  }

  const body = entry.plainText
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (body.length > 0) {
    if (paragraphs.length > 0) paragraphs.push('* * *')
    paragraphs.push(...body)
  }

  return paragraphs.length > 0 ? paragraphs : ['Nothing written yet.']
}

export function compileWorldBible(input: {
  project: Project
  entries: CodexEntry[]
  scenes: Scene[]
  chapterTitles: Map<string, string>
  /** Portrait size lookup: imageAssets id → its natural {width, height}. */
  imageSizes?: Map<string, { width: number; height: number }>
}): WorldBible {
  const { project, entries, scenes, chapterTitles, imageSizes } = input
  const nameById = new Map(entries.map((entry) => [entry.id, entry.name]))
  const chapters: WorldBibleChapter[] = []

  for (const type of SECTION_ORDER) {
    const ofType = entries
      .filter((entry) => entry.type === type)
      .sort((a, b) => a.name.localeCompare(b.name))
    if (ofType.length === 0) continue

    // The section opener: a contents-like page naming what follows.
    chapters.push({
      title: SECTION_TITLE[type],
      paragraphs: ofType.map((entry) =>
        entry.summary.trim() ? `${entry.name} - ${entry.summary.trim()}` : entry.name,
      ),
    })

    for (const entry of ofType) {
      const chapter: WorldBibleChapter = {
        title: entry.name,
        paragraphs: entryParagraphs(entry, nameById),
      }
      if (entry.imageId) {
        const size = imageSizes?.get(entry.imageId)
        const ratio = size && size.width > 0 ? size.height / size.width : 1
        chapter.imageId = entry.imageId
        chapter.art = {
          key: entry.imageId,
          width: PORTRAIT_BOX,
          height: Math.max(24, Math.round(PORTRAIT_BOX * ratio)),
        }
      }
      chapters.push(chapter)
    }
  }

  // ---- The web: every relationship in one place. ----
  const web: string[] = []
  for (const entry of entries) {
    for (const relationship of entry.relationships) {
      const target = nameById.get(relationship.targetEntryId)
      if (!target) continue
      web.push(
        relationship.label.trim()
          ? `${entry.name} - ${relationship.label.trim()} - ${target}`
          : `${entry.name} - ${target}`,
      )
    }
  }
  if (web.length > 0) {
    chapters.push({ title: 'The Web of Relationships', paragraphs: web.sort() })
  }

  // ---- The timeline: scenes with a story day, in story order. ----
  const dated = scenes
    .filter((scene) => typeof scene.storyDay === 'number')
    .sort((a, b) => (a.storyDay ?? 0) - (b.storyDay ?? 0))
  if (dated.length > 0) {
    chapters.push({
      title: 'The Timeline',
      paragraphs: dated.map((scene) => {
        const where = chapterTitles.get(scene.chapterId)
        const title = scene.title || 'Untitled scene'
        return `Day ${scene.storyDay} - ${title}${where ? ` (${where})` : ``}`
      }),
    })
  }

  return {
    title: `${project.title}: The World`,
    author: project.author,
    chapters,
    entryCount: entries.length,
  }
}
