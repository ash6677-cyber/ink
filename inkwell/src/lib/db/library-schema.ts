import type {
  AiPreset,
  AiProviderConfig,
  CardChat,
  CharacterCard,
  Chapter,
  CodexEntry,
  Cover,
  Goal,
  Lorebook,
  ManuscriptTemplate,
  Persona,
  Project,
  RevisionPass,
  Scene,
  Series,
  SessionLog,
  Snapshot,
  StoryPromise,
  Theme,
} from '@/types'

export const CURRENT_SCHEMA_VERSION = 2

/** Disk-safe stand-in for ImageAsset: JSON can't hold a Blob, so the binary is
 * base64-encoded for storage and converted back to a Blob on load. */
export interface StoredImageAsset {
  id: string
  createdAt: number
  updatedAt: number
  mimeType: string
  width: number
  height: number
  fileName: string
  dataBase64: string
}

export interface LibraryDocument {
  schemaVersion: number
  projects: Project[]
  series: Series[]
  chapters: Chapter[]
  scenes: Scene[]
  snapshots: Snapshot[]
  codexEntries: CodexEntry[]
  characterCards: CharacterCard[]
  cardChats: CardChat[]
  personas: Persona[]
  lorebooks: Lorebook[]
  covers: Cover[]
  aiPresets: AiPreset[]
  aiProviders: AiProviderConfig[]
  imageAssets: StoredImageAsset[]
  goals: Goal[]
  sessionLogs: SessionLog[]
  manuscriptTemplates: ManuscriptTemplate[]
  themes: Theme[]
  revisionPasses: RevisionPass[]
  promises: StoryPromise[]
}

const ARRAY_KEYS = [
  'projects',
  'series',
  'chapters',
  'scenes',
  'snapshots',
  'codexEntries',
  'characterCards',
  'cardChats',
  'personas',
  'lorebooks',
  'covers',
  'aiPresets',
  'aiProviders',
  'imageAssets',
  'goals',
  'sessionLogs',
  'manuscriptTemplates',
  'themes',
  'revisionPasses',
  'promises',
] as const

export function emptyLibrary(): LibraryDocument {
  const doc = { schemaVersion: CURRENT_SCHEMA_VERSION } as LibraryDocument
  for (const key of ARRAY_KEYS) (doc as unknown as Record<string, unknown>)[key] = []
  return doc
}

/**
 * Forward-only migration chain. Each numbered step brings a document exactly
 * one schema version forward; a document at any older version runs through
 * every step in order until it reaches CURRENT_SCHEMA_VERSION. Steps only
 * ever add sane defaults for fields that didn't used to exist — never drop
 * or reinterpret data — so migration can't be lossy.
 */
export function migrateLibrary(raw: unknown): LibraryDocument {
  let doc = normalizeShape(raw)
  const version = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : 0
  if (version < 1) doc = migrateV0ToV1(doc)
  if (version < 2) doc = migrateV1ToV2(doc)
  // Tables added after a document's schema version was current arrive as
  // missing keys, and only the v0 step used to backfill them — a document
  // already at the current version skipped every step and loaded with
  // `undefined` where a new table's array should be, which crashed hydrate.
  // Backfilling unconditionally makes adding a table safe forever.
  for (const key of ARRAY_KEYS) {
    if (!Array.isArray(doc[key])) doc[key] = []
  }
  return doc as unknown as LibraryDocument
}

function normalizeShape(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return { schemaVersion: 0 }
  return { schemaVersion: 0, ...(raw as Record<string, unknown>) }
}

/**
 * v0 covers every pre-Phase-7 library shape: no lorebooks/personas/cardChats/
 * covers tables existed yet, and projects created before the chapters-only
 * structure mode shipped have no `settings.structureMode`. This mirrors the
 * defensive `project.settings.structureMode ?? 'scenes'` read-site fallback
 * used elsewhere in the app before this migration existed, but bakes the
 * default in permanently at load time instead of re-checking on every read.
 */
function migrateV0ToV1(doc: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...doc }
  for (const key of ARRAY_KEYS) {
    if (!Array.isArray(next[key])) next[key] = []
  }
  next.projects = (next.projects as Array<Record<string, unknown>>).map((project) => {
    const settings = (project.settings as Record<string, unknown>) ?? {}
    return {
      ...project,
      settings: {
        defaultAiPresetId: null,
        measureWidthCh: 68,
        ...settings,
        structureMode: settings.structureMode ?? 'scenes',
      },
    }
  })
  next.schemaVersion = 1
  return next
}

/**
 * v2 adds the box set: series gained presentation settings for their
 * slipcase, and projects gained a position in their series' reading order.
 *
 * Reading order is seeded from creation date, which is the closest thing an
 * older library has to an intended sequence — the book started first is
 * usually book one. It is only a starting point; the writer can reorder it,
 * and doing so overwrites these numbers.
 */
function migrateV1ToV2(doc: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...doc }

  next.series = (next.series as Array<Record<string, unknown>>).map((series) => ({
    ...series,
    boxSet: {
      caseColor: '#2a2f3a',
      foilColor: '#d8c69a',
      reveal: 0.32,
      finish: 'satin',
      ...((series.boxSet as Record<string, unknown>) ?? {}),
    },
  }))

  const projects = next.projects as Array<Record<string, unknown>>
  const positions = new Map<string, number>()
  const seeded = [...projects].sort(
    (a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0),
  )
  for (const project of seeded) {
    const seriesId = typeof project.seriesId === 'string' ? project.seriesId : null
    if (!seriesId) continue
    const nextPosition = (positions.get(seriesId) ?? 0) + 1
    positions.set(seriesId, nextPosition)
    project.seriesOrder = project.seriesOrder ?? nextPosition
  }
  next.projects = projects.map((project) => ({ ...project, seriesOrder: project.seriesOrder ?? 0 }))

  next.schemaVersion = 2
  return next
}
