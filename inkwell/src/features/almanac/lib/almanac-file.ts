/**
 * The Almanac as a file — knowledge that can leave one book and enter another.
 *
 * Until now the people and places of a book could leave only inside a whole
 * library backup, which is the wrong shape for the commonest reason to want
 * them out: the next book in the series lives in a different project, or a
 * different writer's copy entirely, and it needs the *cast*, not the prose.
 *
 * The format is versioned JSON, images carried inline as base64 — the same
 * convention the library backup uses — so one file is the whole answer, and
 * a file made today still opens in whatever this parser has become.
 *
 * Everything here is pure: serialising takes data in, parsing gives data
 * back, and neither touches the database. The judgement worth testing — what
 * counts as a duplicate, what a malformed file does, how ids are reassigned
 * so a file imported twice cannot collide with itself — lives here.
 */

import type { CodexEntry } from '@/types'

export const ALMANAC_FILE_VERSION = 1

export interface AlmanacImage {
  /** The exporting library's asset id — remapped to fresh ids on import. */
  id: string
  mimeType: string
  base64: string
}

export interface AlmanacFile {
  kind: 'inkwell-almanac'
  version: number
  exportedAt: number
  projectTitle: string
  entries: AlmanacFileEntry[]
  images: AlmanacImage[]
}

/**
 * An entry as the file carries it: no database ids, timestamps, or project.
 * `refId` is a linking key, not an id — relationships in the file point at
 * it, and the importer maps it to whatever fresh id the destination assigns,
 * so "Charlotte is Tomas's sister" survives both of them being renumbered.
 */
export type AlmanacFileEntry = Pick<
  CodexEntry,
  | 'type'
  | 'name'
  | 'aliases'
  | 'summary'
  | 'body'
  | 'plainText'
  | 'attributes'
  | 'relationships'
  | 'tags'
  | 'aiContext'
  | 'aiContextTokenBudget'
> & { imageId: string | null; refId: string }

export function serializeAlmanac(
  projectTitle: string,
  entries: CodexEntry[],
  images: AlmanacImage[],
  exportedAt = Date.now(),
): AlmanacFile {
  const wanted = new Set(entries.map((e) => e.imageId).filter(Boolean))
  return {
    kind: 'inkwell-almanac',
    version: ALMANAC_FILE_VERSION,
    exportedAt,
    projectTitle,
    entries: entries.map((entry) => ({
      refId: entry.id,
      type: entry.type,
      name: entry.name,
      aliases: entry.aliases,
      summary: entry.summary,
      body: entry.body,
      plainText: entry.plainText,
      attributes: entry.attributes,
      relationships: entry.relationships,
      tags: entry.tags,
      aiContext: entry.aiContext,
      aiContextTokenBudget: entry.aiContextTokenBudget,
      imageId: entry.imageId,
    })),
    // Only images an entry actually points at. An export must not become a
    // vehicle for every orphaned upload the library has ever seen.
    images: images.filter((image) => wanted.has(image.id)),
  }
}

export type ParsedAlmanac =
  | { ok: true; file: AlmanacFile }
  | { ok: false; reason: string }

/**
 * Reads a file that claims to be an almanac, trusting nothing.
 *
 * Refusals name their reason, because "could not import" leaves a writer
 * staring at a JSON file with no idea which of its ten thousand lines is the
 * problem. A version from the future is refused rather than half-read: the
 * fields this version understands might no longer mean what they meant.
 */
export function parseAlmanacFile(raw: unknown): ParsedAlmanac {
  let data: unknown = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return { ok: false, reason: 'This is not a JSON file.' }
    }
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, reason: 'This is not an almanac file.' }
  }
  const file = data as Partial<AlmanacFile>
  if (file.kind !== 'inkwell-almanac') {
    return { ok: false, reason: 'This is not an almanac file — it may be a full library backup.' }
  }
  if (typeof file.version !== 'number' || file.version > ALMANAC_FILE_VERSION) {
    return {
      ok: false,
      reason: 'This file was made by a newer version of the app. Update and try again.',
    }
  }
  if (!Array.isArray(file.entries)) {
    return { ok: false, reason: 'The file has no entries in it.' }
  }
  for (const entry of file.entries) {
    if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string' || !entry.name.trim()) {
      return { ok: false, reason: 'An entry in this file has no name.' }
    }
  }
  return {
    ok: true,
    file: {
      kind: 'inkwell-almanac',
      version: file.version,
      exportedAt: typeof file.exportedAt === 'number' ? file.exportedAt : 0,
      projectTitle: typeof file.projectTitle === 'string' ? file.projectTitle : '',
      entries: file.entries,
      images: Array.isArray(file.images) ? file.images : [],
    },
  }
}

export interface ImportPlan {
  /** Entries to create, with imageId still pointing at the file's image ids. */
  create: AlmanacFileEntry[]
  /** Names already present, left untouched. */
  skipped: string[]
  /**
   * File refIds resolved to entries the destination already has. A skipped
   * Tomas is still Tomas: Charlotte's "sister of" should point at him here,
   * not die because he did not need importing.
   */
  matchedByRef: Map<string, string>
}

/**
 * What an import would do, decided before anything is written.
 *
 * A name that already exists in the destination is skipped rather than
 * duplicated or overwritten: the version already there may carry months of
 * work, and an import is the wrong place to lose it silently. Matching is by
 * name and type together — a character called Winter and a place called
 * Winter are different things and both get to exist.
 */
export function planAlmanacImport(
  incoming: AlmanacFileEntry[],
  existing: Pick<CodexEntry, 'id' | 'name' | 'type'>[],
): ImportPlan {
  const keyOf = (e: Pick<CodexEntry, 'name' | 'type'>) =>
    `${e.type} ${e.name.trim().toLowerCase()}`
  const existingByKey = new Map(existing.map((e) => [keyOf(e), e.id]))
  const taken = new Set(existingByKey.keys())
  const create: AlmanacFileEntry[] = []
  const skipped: string[] = []
  const matchedByRef = new Map<string, string>()
  for (const entry of incoming) {
    const key = keyOf(entry)
    if (taken.has(key)) {
      skipped.push(entry.name)
      const match = existingByKey.get(key)
      if (match) matchedByRef.set(entry.refId, match)
      continue
    }
    // A file naming the same entry twice must not import it twice either.
    taken.add(key)
    create.push(entry)
  }
  return { create, skipped, matchedByRef }
}

/** Base64 of a blob, chunked so a large image cannot blow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/**
 * Relationships, re-pointed at the ids the destination actually assigned.
 *
 * A relationship whose target was skipped (or was never in the file) is
 * dropped rather than kept dangling: a link to an id that means nothing here
 * is worse than no link, because it looks like data and answers like a bug.
 */
export function remapRelationships(
  entry: AlmanacFileEntry,
  newIdByRef: Map<string, string>,
): AlmanacFileEntry['relationships'] {
  return entry.relationships
    .map((rel) => {
      const target = newIdByRef.get(rel.targetEntryId)
      return target ? { ...rel, targetEntryId: target } : null
    })
    .filter((rel): rel is NonNullable<typeof rel> => rel !== null)
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
