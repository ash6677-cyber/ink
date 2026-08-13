import type { BaseEntity } from './base'

export type SceneStatus = 'outline' | 'drafting' | 'revised' | 'done'

/**
 * What kind of division of the book this is.
 *
 * A prologue is not chapter one under another name. It comes before the
 * numbering starts, and a book with a prologue, twelve chapters and an
 * epilogue has twelve chapters — not fourteen. Without this the reader
 * printed "Chapter 1" above the prologue and was one out for the rest of
 * the novel.
 */
export type ChapterKind =
  | 'prologue'
  | 'chapter'
  | 'interlude'
  | 'part'
  | 'epilogue'
  // Not everything written here is a novel. A screenplay is divided into
  // acts, a collection into poems, a diary into entries — and calling any of
  // those a chapter would be wrong in the tree and wrong again in the reader.
  | 'act'
  | 'poem'
  | 'entry'

export interface Chapter extends BaseEntity {
  projectId: string
  title: string
  order: number
  status: SceneStatus
  /**
   * Absent on every chapter written before kinds existed, which is why it is
   * optional rather than migrated: a missing kind reads as an ordinary
   * chapter, so no existing manuscript changes shape. Read it through
   * `chapterKind()` rather than directly.
   */
  kind?: ChapterKind
  /** A per-chapter word target, when the writer sets one. Absent or null
   * means no target — the book-level goal alone. Optional-by-absence. */
  targetWords?: number | null
}

export interface SceneBeat {
  id: string
  text: string
  order: number
  generated: boolean
}

/** TipTap JSON document. Kept as `unknown` here; validated at the editor boundary. */
export type RichContent = unknown

export interface Scene extends BaseEntity {
  chapterId: string
  projectId: string
  title: string
  order: number
  content: RichContent
  plainText: string
  wordCount: number
  status: SceneStatus
  povCharacterId: string | null
  locationCodexId: string | null
  summary: string
  beats: SceneBeat[]
  labels: string[]
  linkedCodexIds: string[]
  /** When this scene happens in story time, as an integer day on the
   * writer's own scale (day 1, day 2, a flashback at day -30). Absent when
   * unset — optional-by-absence, no migration; the timeline groups by it. */
  storyDay?: number | null
}

/**
 * A named freeze of the whole manuscript — "Draft 1" — against which the
 * current text is judged. The frozen scene contents live as ordinary
 * snapshots labelled `Baseline — <name>`; this row is the pass itself.
 */
export interface RevisionPass extends BaseEntity {
  projectId: string
  name: string
  /** What the book measured at the freeze, for the report's honesty. */
  sceneCount: number
  wordCount: number
}

/**
 * A narrative promise — Chekhov's gun, tracked. Made in one scene (the
 * setup: the locket, the loaded rifle, the unexplained scar), optionally
 * paid off in another. The ledger's whole job is the ones where
 * `payoffSceneId` is still null when the book ends.
 */
export interface StoryPromise extends BaseEntity {
  projectId: string
  title: string
  /** The passage the writer selected when marking the setup, if any. */
  quote: string
  note: string
  setupSceneId: string
  payoffSceneId: string | null
}

export interface Snapshot extends BaseEntity {
  sceneId: string
  content: RichContent
  plainText: string
  wordCount: number
  label: string
}
