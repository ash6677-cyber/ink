import { base64ToBlob, blobToBase64 } from '@/lib/base64'
import {
  CURRENT_SCHEMA_VERSION,
  emptyLibrary,
  migrateLibrary,
  type LibraryDocument,
  type StoredImageAsset,
} from '@/lib/db/library-schema'
import { db } from '@/lib/db/schema'
import type { ImageAsset } from '@/types'

/**
 * Whole-library export and import for the browser build.
 *
 * The desktop app has had this since it gained disk storage; the browser
 * build had nothing but per-project manuscript export, which meant the only
 * copy of everything else — the Codex, characters, covers, writing history —
 * lived in one browser's IndexedDB and could not be got out at all.
 *
 * The document is byte-for-byte the same shape the desktop app reads and
 * writes, so a file exported from a phone opens on the desktop and the other
 * way round. Images travel as base64 for the same reason: JSON has no way to
 * carry a Blob, and a library that dropped its cover art on export would be a
 * backup only in name.
 */

/**
 * Ordered so the JSON diffs readably and matches the desktop writer.
 *
 * Exported so a test can hold it against the database's own table list. This
 * is the one part of a backup that fails silently: add a table, forget to add
 * it here, and every export from that day on is quietly missing something
 * nobody notices until they need it. Two tables have already been added to
 * this list by hand.
 */
export const BACKED_UP_TABLES = [
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
  'goals',
  'sessionLogs',
  'manuscriptTemplates',
  'themes',
] as const

/**
 * Tables the loop above does not carry, each for a stated reason.
 *
 * `imageAssets` holds Blobs, which JSON cannot express, so it is converted to
 * base64 separately below. `aiProviders` holds credentials and is emptied on
 * purpose. Anything else missing from both lists is an oversight, and the
 * test that pairs these with the schema is what says so.
 */
export const HANDLED_SEPARATELY = ['imageAssets', 'aiProviders'] as const

/** Any set of tables that can hand over their rows — the live library by
 * default, but also another library opened read-only (the claim flow reads
 * the guest library this way while an account's own library is active). */
export type ReadableTables = Record<string, { toArray(): Promise<unknown[]> }>

export async function buildLibraryDocument(
  tables: ReadableTables = db as unknown as ReadableTables,
): Promise<LibraryDocument> {
  const doc = emptyLibrary()
  doc.schemaVersion = CURRENT_SCHEMA_VERSION

  await Promise.all(
    BACKED_UP_TABLES.map(async (name) => {
      const rows = await tables[name].toArray()
      ;(doc as unknown as Record<string, unknown>)[name] = rows
    }),
  )

  // API keys are deliberately excluded. They are the one thing here that is a
  // credential rather than a piece of writing, they never leave the device
  // they were entered on, and a backup file is exactly the sort of thing that
  // gets emailed to oneself.
  doc.aiProviders = []

  const assets = (await tables.imageAssets.toArray()) as ImageAsset[]
  doc.imageAssets = await Promise.all(
    assets.map(
      async (asset): Promise<StoredImageAsset> => ({
        id: asset.id,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        fileName: asset.fileName,
        dataBase64: await blobToBase64(asset.blob),
      }),
    ),
  )

  return doc
}

export function libraryFilename(): string {
  return `inkwell-library-${new Date().toISOString().slice(0, 10)}.inkwell`
}

/** Serialised separately from saving so the size can be reported first. */
export async function exportLibraryBlob(): Promise<Blob> {
  const doc = await buildLibraryDocument()
  return new Blob([JSON.stringify(doc)], { type: 'application/json' })
}

/**
 * Replaces everything currently stored with the contents of a library file.
 *
 * Destructive by design — it is the restore half of a backup — so the caller
 * is responsible for confirming with the user first.
 */
export async function importLibraryDocument(raw: string): Promise<void> {
  const doc = migrateLibrary(JSON.parse(raw))

  // Everything goes through the same table interface the rest of the app
  // uses rather than reaching into Dexie, so a restore behaves like ordinary
  // edits — including replicating to the cloud when the user is signed in.
  async function replace<T extends { id: string }>(
    table: {
      toArray(): Promise<T[]>
      add(entity: T): Promise<unknown>
      bulkDelete(ids: string[]): Promise<unknown>
    },
    rows: T[],
  ): Promise<void> {
    const existing = await table.toArray()
    if (existing.length) await table.bulkDelete(existing.map((row) => row.id))
    for (const row of rows) await table.add(row)
  }

  for (const name of BACKED_UP_TABLES) {
    const rows = ((doc as unknown as Record<string, unknown[]>)[name] ?? []) as { id: string }[]
    await replace(db[name] as never, rows)
  }

  await replace(
    db.imageAssets as never,
    doc.imageAssets.map(
      (stored): ImageAsset => ({
        id: stored.id,
        createdAt: stored.createdAt,
        updatedAt: stored.updatedAt,
        mimeType: stored.mimeType,
        width: stored.width,
        height: stored.height,
        fileName: stored.fileName,
        blob: base64ToBlob(stored.dataBase64, stored.mimeType),
      }),
    ),
  )
}

/** Rough count of what a library holds, for confirming before a restore. */
export function describeLibrary(doc: LibraryDocument): string {
  const projects = doc.projects.length
  const words = doc.scenes.reduce((sum, scene) => sum + (scene.wordCount ?? 0), 0)
  return `${projects} project${projects === 1 ? '' : 's'} · ${words.toLocaleString()} words`
}
