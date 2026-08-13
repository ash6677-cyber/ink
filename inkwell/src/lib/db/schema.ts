import Dexie, { type EntityTable } from 'dexie'
import type {
  AiPreset,
  AiProviderConfig,
  BaseEntity,
  CardChat,
  CharacterCard,
  Chapter,
  CodexEntry,
  Cover,
  Goal,
  ImageAsset,
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
  Submission,
  Theme,
  WorldMap,
} from '@/types'

import { syncEngine } from '@/lib/sync/sync-engine'
import { createSyncedTable } from '@/lib/sync/synced-table'

import { libraryDbName, readActiveLibrary } from './active-library'
import type { TableLike } from './repository'
import { createTrashableTable, type TrashableTable } from './soft-delete'
import { isTauriRuntime } from './tauri-bridge'
import { tauriTables } from './tauri-db'

export class InkwellDB extends Dexie {
  projects!: EntityTable<Project, 'id'>
  series!: EntityTable<Series, 'id'>
  chapters!: EntityTable<Chapter, 'id'>
  scenes!: EntityTable<Scene, 'id'>
  snapshots!: EntityTable<Snapshot, 'id'>
  codexEntries!: EntityTable<CodexEntry, 'id'>
  characterCards!: EntityTable<CharacterCard, 'id'>
  cardChats!: EntityTable<CardChat, 'id'>
  personas!: EntityTable<Persona, 'id'>
  lorebooks!: EntityTable<Lorebook, 'id'>
  covers!: EntityTable<Cover, 'id'>
  aiPresets!: EntityTable<AiPreset, 'id'>
  aiProviders!: EntityTable<AiProviderConfig, 'id'>
  imageAssets!: EntityTable<ImageAsset, 'id'>
  goals!: EntityTable<Goal, 'id'>
  sessionLogs!: EntityTable<SessionLog, 'id'>
  manuscriptTemplates!: EntityTable<ManuscriptTemplate, 'id'>
  themes!: EntityTable<Theme, 'id'>
  revisionPasses!: EntityTable<RevisionPass, 'id'>
  promises!: EntityTable<StoryPromise, 'id'>
  worldMaps!: EntityTable<WorldMap, 'id'>
  submissions!: EntityTable<Submission, 'id'>

  constructor(name = 'inkwell') {
    super(name)

    this.version(1).stores({
      projects: 'id, seriesId, status, updatedAt',
      series: 'id, updatedAt',
      chapters: 'id, projectId, order, updatedAt',
      scenes: 'id, projectId, chapterId, order, updatedAt',
      snapshots: 'id, sceneId, createdAt',
      codexEntries: 'id, projectId, seriesId, type, name, updatedAt',
      characterCards: 'id, projectId, codexEntryId, updatedAt',
      cardChats: 'id, cardId, projectId, updatedAt',
      personas: 'id, updatedAt',
      lorebooks: 'id, projectId, updatedAt',
      covers: 'id, projectId, updatedAt',
      aiPresets: 'id, updatedAt',
      aiProviders: 'id, kind, updatedAt',
      imageAssets: 'id, updatedAt',
      goals: 'id, projectId, updatedAt',
      sessionLogs: 'id, projectId, startedAt',
    })

    // The formats a writer defines for themselves. Added in v2 rather than
    // folded into v1 because an existing library must open untouched: Dexie
    // creates the new store and leaves every other table exactly as it is.
    this.version(2).stores({
      manuscriptTemplates: 'id, updatedAt',
    })

    // The looks a writer builds for themselves.
    this.version(3).stores({
      themes: 'id, updatedAt',
    })

    // Named draft freezes ("Draft 1"), judged against by revision mode.
    this.version(4).stores({
      revisionPasses: 'id, projectId, createdAt',
    })

    // Narrative promises and their payoffs — Chekhov's ledger.
    this.version(5).stores({
      promises: 'id, projectId, setupSceneId, updatedAt',
    })

    // The writer's own maps, pinned to Almanac entries.
    this.version(6).stores({
      worldMaps: 'id, projectId, updatedAt',
    })

    // The querying trail: who has this book, and where it stands.
    this.version(7).stores({
      submissions: 'id, projectId, status, updatedAt',
    })
  }
}

interface DbTables {
  projects: TrashableTable<Project>
  series: TrashableTable<Series>
  chapters: TrashableTable<Chapter>
  scenes: TrashableTable<Scene>
  snapshots: TrashableTable<Snapshot>
  codexEntries: TrashableTable<CodexEntry>
  characterCards: TrashableTable<CharacterCard>
  cardChats: TrashableTable<CardChat>
  personas: TrashableTable<Persona>
  lorebooks: TrashableTable<Lorebook>
  covers: TrashableTable<Cover>
  aiPresets: TrashableTable<AiPreset>
  aiProviders: TrashableTable<AiProviderConfig>
  imageAssets: TrashableTable<ImageAsset>
  goals: TrashableTable<Goal>
  sessionLogs: TrashableTable<SessionLog>
  manuscriptTemplates: TrashableTable<ManuscriptTemplate>
  themes: TrashableTable<Theme>
  revisionPasses: TrashableTable<RevisionPass>
  promises: TrashableTable<StoryPromise>
  worldMaps: TrashableTable<WorldMap>
  submissions: TrashableTable<Submission>
}

/** The raw tables, before soft-delete or sync wrapping. */
type RawDbTables = Record<keyof DbTables, TableLike<BaseEntity>>

/** Browser build (web) reads/writes IndexedDB via Dexie; the desktop build
 * (Tauri) never touches Dexie at all — it uses an in-memory store that's
 * hydrated from and persisted to a real file on disk. Every store and
 * component goes through `db.<table>` exactly the same way either way.
 *
 * Which library opens is decided here, before anything reads a row: each
 * account has its own database (and its own file on desktop), the guest
 * library keeps the original name, and the auth bridge reloads the app
 * whenever the signed-in account changes so no cache outlives a switch. */
function createRawDbTables(): RawDbTables {
  if (isTauriRuntime()) return tauriTables as unknown as RawDbTables
  const active = typeof localStorage === 'undefined' ? 'guest' : readActiveLibrary(localStorage)
  return new InkwellDB(libraryDbName(active)) as unknown as RawDbTables
}

/**
 * Registers each raw table with the sync engine (so incoming remote changes
 * can be written straight to storage) and hands back wrapped tables that
 * report outgoing local edits. Local-only use is unaffected: with no user
 * signed in, the engine drops every notification on the floor.
 */
function withCloudSync(raw: RawDbTables): DbTables {
  const wrapped: Record<string, TrashableTable<BaseEntity>> = {}
  for (const [name, table] of Object.entries(raw)) {
    const typed = table as TableLike<BaseEntity>
    // The sync engine writes incoming remote records to the *raw* table, so a
    // record binned on another device arrives carrying its own `deletedAt`
    // rather than being re-filtered on the way in.
    syncEngine.registerTable(name, typed)
    const synced = createSyncedTable(name, typed, (t, id, kind) =>
      syncEngine.notifyLocalChange(t, id, kind),
    )
    // Soft-delete sits *outside* sync deliberately. Binning is an update, so
    // it travels to other devices as one and a restore undoes it there too —
    // where a hard delete would broadcast a tombstone there is no coming back
    // from.
    wrapped[name] = createTrashableTable(synced)
  }
  return wrapped as unknown as DbTables
}

export const db: DbTables = withCloudSync(createRawDbTables())
