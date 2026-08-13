import { create } from 'zustand'

import {
  cascadeForChapter,
  cascadeForProject,
  cascadeForScene,
  emptyCascadeSource,
  type CascadePlan,
  type CascadeSource,
} from '@/lib/db/cascade'
import { db } from '@/lib/db/schema'
import { expiredIds, BIN_RETENTION_DAYS } from '@/lib/db/soft-delete'
import type { BaseEntity } from '@/types'

/** Tables the bin lists as things a person deliberately deleted. */
const ROOT_TABLES = ['projects', 'series', 'chapters', 'scenes', 'codexEntries', 'characterCards'] as const
type RootTable = (typeof ROOT_TABLES)[number]

const ROOT_LABEL: Record<RootTable, string> = {
  projects: 'Project',
  series: 'Series',
  chapters: 'Chapter',
  scenes: 'Scene',
  codexEntries: 'Codex entry',
  characterCards: 'Character',
}

/** Every table a cascade can reach, so restore and purge know where to look. */
const CASCADE_TABLES = [
  'chapters', 'scenes', 'snapshots', 'covers', 'goals',
  'sessionLogs', 'revisionPasses', 'promises', 'worldMaps',
  'codexEntries', 'characterCards', 'cardChats', 'lorebooks',
] as const

export interface BinEntry {
  id: string
  table: RootTable
  kind: string
  name: string
  deletedAt: number
  /** How many other records went into the bin alongside it. */
  alsoBinned: number
}

interface TrashState {
  entries: BinEntry[]
  status: 'idle' | 'loading' | 'ready'
  fetchBin: () => Promise<void>
  restore: (entry: BinEntry) => Promise<void>
  purge: (entry: BinEntry) => Promise<void>
  emptyBin: () => Promise<void>
  /** Removes anything past the retention window. Safe to call on boot. */
  sweepExpired: () => Promise<void>
}

/** Reads just enough of every table for the cascade to be worked out. */
async function readCascadeSource(): Promise<CascadeSource> {
  const [
    chapters, scenes, snapshots, covers, goals,
    sessionLogs, revisionPasses, promises, worldMaps,
    codexEntries, characterCards, cardChats, lorebooks,
  ] = await Promise.all([
    db.chapters.toArray(), db.scenes.toArray(), db.snapshots.toArray(),
    db.covers.toArray(), db.goals.toArray(), db.sessionLogs.toArray(),
    db.revisionPasses.toArray(), db.promises.toArray(), db.worldMaps.toArray(),
    db.codexEntries.toArray(), db.characterCards.toArray(),
    db.cardChats.toArray(), db.lorebooks.toArray(),
  ])
  return {
    ...emptyCascadeSource(),
    chapters, scenes, snapshots, covers, goals,
    sessionLogs, revisionPasses, promises, worldMaps,
    codexEntries, characterCards, cardChats, lorebooks,
  }
}

/**
 * Bins a record and everything that belongs to it, as one event.
 *
 * Exported rather than kept private because the stores that own each record
 * type call it — there is one implementation of "delete this properly" and
 * every delete in the app goes through it.
 */
export async function binWithCascade(
  table: RootTable,
  id: string,
  plan: CascadePlan,
): Promise<void> {
  const at = Date.now()
  for (const [name, ids] of Object.entries(plan) as [(typeof CASCADE_TABLES)[number], string[]][]) {
    await db[name].softDelete(ids, at, id)
  }
  // The root goes last, so an interruption leaves dependants attributed to a
  // root that is still live — recoverable — rather than a root in the bin
  // whose contents were never marked.
  await db[table].softDelete([id], at, null)
}

/** Works out and applies the cascade for one of the three nested types. */
export async function binProject(id: string) {
  return binWithCascade('projects', id, cascadeForProject(id, await readCascadeSource()))
}
export async function binChapter(id: string) {
  return binWithCascade('chapters', id, cascadeForChapter(id, await readCascadeSource()))
}
export async function binScene(id: string) {
  return binWithCascade('scenes', id, cascadeForScene(id, await readCascadeSource()))
}

/** Whatever the record calls itself — every binnable type names itself
 * differently, and none of them share a field. */
function describe(record: BaseEntity): string {
  const fields = record as unknown as Record<string, unknown>
  const named = [fields.title, fields.name, fields.displayName].find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  )
  return named?.trim() ?? 'Untitled'
}

export const useTrashStore = create<TrashState>((set, get) => ({
  entries: [],
  status: 'idle',

  fetchBin: async () => {
    set({ status: 'loading' })
    const perTable = await Promise.all(
      ROOT_TABLES.map(async (table) => {
        const deleted = await db[table].listDeleted()
        return deleted
          .filter((record) => (record.deletedWith ?? null) === null)
          .map<BinEntry>((record) => ({
            id: record.id,
            table,
            kind: ROOT_LABEL[table],
            name: describe(record),
            deletedAt: record.deletedAt ?? 0,
            alsoBinned: 0,
          }))
      }),
    )

    const entries = perTable.flat()

    // Count what each root took with it, so the list can say "and 46 other
    // records" rather than leaving the writer to guess what restoring brings.
    const counts = new Map<string, number>()
    for (const name of CASCADE_TABLES) {
      for (const record of await db[name].listDeleted()) {
        const root = record.deletedWith ?? null
        if (root) counts.set(root, (counts.get(root) ?? 0) + 1)
      }
    }
    for (const entry of entries) entry.alsoBinned = counts.get(entry.id) ?? 0

    entries.sort((a, b) => b.deletedAt - a.deletedAt)
    set({ entries, status: 'ready' })
  },

  restore: async (entry) => {
    await db[entry.table].restore([entry.id])
    for (const name of CASCADE_TABLES) {
      const dependants = (await db[name].listDeleted())
        .filter((record) => record.deletedWith === entry.id)
        .map((record) => record.id)
      if (dependants.length > 0) await db[name].restore(dependants)
    }
    await get().fetchBin()
  },

  purge: async (entry) => {
    for (const name of CASCADE_TABLES) {
      const dependants = (await db[name].listDeleted())
        .filter((record) => record.deletedWith === entry.id)
        .map((record) => record.id)
      if (dependants.length > 0) await db[name].purge(dependants)
    }
    await db[entry.table].purge([entry.id])
    await get().fetchBin()
  },

  emptyBin: async () => {
    for (const entry of get().entries) {
      for (const name of CASCADE_TABLES) {
        const dependants = (await db[name].listDeleted())
          .filter((record) => record.deletedWith === entry.id)
          .map((record) => record.id)
        if (dependants.length > 0) await db[name].purge(dependants)
      }
      await db[entry.table].purge([entry.id])
    }
    await get().fetchBin()
  },

  sweepExpired: async () => {
    const now = Date.now()
    for (const name of [...ROOT_TABLES, ...CASCADE_TABLES]) {
      const stale = expiredIds<BaseEntity>(await db[name].listDeleted(), now)
      if (stale.length > 0) await db[name].purge(stale)
    }
  },
}))

export { BIN_RETENTION_DAYS }
