import type { BaseEntity } from './base'

export type ProjectStatus = 'planning' | 'drafting' | 'revising' | 'complete' | 'archived'
export type PointOfView = 'first' | 'second' | 'third-limited' | 'third-omniscient' | 'multiple'
export type Tense = 'past' | 'present'
/** 'scenes': chapters contain multiple scenes (NovelWriter-style). 'chapters-only':
 * each chapter is a single writable unit with no visible scene subdivision. */
export type StructureMode = 'scenes' | 'chapters-only'

export interface ProjectSettings {
  defaultAiPresetId: string | null
  pov: PointOfView
  tense: Tense
  measureWidthCh: number
  structureMode: StructureMode
}

/**
 * The parts of a book that aren't chapters: what stands before the story
 * and after it. Stored as plain text on the project — they are single
 * short passages, not manuscripts — and compiled into every export, the
 * reader, and shared copies as real sections rather than text faked into
 * chapter one. Empty strings mean the section simply doesn't exist.
 */
export interface BookMatter {
  dedication: string
  epigraph: string
  epigraphAttribution: string
  acknowledgments: string
  aboutAuthor: string
}

export interface Project extends BaseEntity {
  title: string
  author: string
  synopsis: string
  genre: string
  targetWordCount: number
  /**
   * The last cover PNG this project exported, as an `imageAssets` id.
   *
   * Not the cover design and not a `covers` row — the design is found the
   * other way round, by `Cover.projectId`. The name reads like a link to one,
   * which is exactly the mistake the box set used to make: it looked this id
   * up in the `covers` table, found nothing, and drew blank jackets for books
   * that had art. Nothing displays from this field. To draw a cover anywhere,
   * use `resolveCoverArt`.
   */
  coverId: string | null
  /** The published read-only copy's id, or absent/null when not shared.
   * Optional-by-absence: projects made before sharing existed stay valid. */
  shareId?: string | null
  /** How many chapter documents the live share holds — what revoke and a
   * shrinking re-publish must sweep. */
  shareChapterCount?: number
  seriesId: string | null
  /**
   * Position in its series — book one, book two, and so on.
   *
   * Reading order is authorial, not chronological: a prequel written last
   * still belongs at the front of the shelf. Nothing about the record's dates
   * can express that, so the writer sets it and the box set is built from it.
   * Meaningless while `seriesId` is null.
   */
  seriesOrder: number
  /**
   * A look of this book's own, worn whenever it is open.
   *
   * Null — and absent on every project made before themes existed — means it
   * follows whatever the writer has chosen for the app. Set, it wins while
   * the book is open and stops mattering the moment they leave, which is why
   * it lives here and not in the theme store: it is a property of the book,
   * travels with it between devices, and survives the app being reinstalled.
   */
  themeId?: string | null
  status: ProjectStatus
  settings: ProjectSettings
  /** Front & back matter, when the writer has written any.
   * Optional-by-absence: projects made before it existed stay valid. */
  matter?: BookMatter | null
}

/** Surface finish of the slipcase board, which decides how it takes light. */
export type BoxSetFinish = 'matte' | 'satin' | 'gloss'

export interface SeriesBoxSet {
  /** Board colour of the slipcase. */
  caseColor: string
  /** Colour the series name is stamped in. */
  foilColor: string
  /** How far the books stand proud of the case, 0 (flush) to 1 (half out). */
  reveal: number
  finish: BoxSetFinish
}

export interface Series extends BaseEntity {
  name: string
  description: string
  sharedCodex: boolean
  boxSet: SeriesBoxSet
}
