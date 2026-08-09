/**
 * The Almanac file's two ends: the library it leaves and the one it enters.
 *
 * The judgement — duplicates, versioning, relationship remapping — lives in
 * `almanac-file.ts` and is tested without a database. This is only the
 * plumbing on either side of it: reading entries and images out, and writing
 * fresh rows in, with every id minted by the destination.
 */

import { codexRepo, imageAssetRepo } from '@/lib/db/repositories'
import type { CodexEntry } from '@/types'

import {
  base64ToBytes,
  bytesToBase64,
  parseAlmanacFile,
  planAlmanacImport,
  remapRelationships,
  serializeAlmanac,
  type AlmanacFile,
  type AlmanacImage,
} from './almanac-file'

export async function exportAlmanac(projectId: string, projectTitle: string): Promise<AlmanacFile> {
  const entries = (await codexRepo.list()).filter((e) => e.projectId === projectId)

  const images: AlmanacImage[] = []
  for (const entry of entries) {
    if (!entry.imageId) continue
    const asset = await imageAssetRepo.get(entry.imageId)
    if (!asset) continue
    images.push({
      id: asset.id,
      mimeType: asset.mimeType,
      base64: bytesToBase64(new Uint8Array(await asset.blob.arrayBuffer())),
    })
  }

  return serializeAlmanac(projectTitle, entries, images)
}

export interface AlmanacImportResult {
  created: number
  skipped: string[]
}

export async function importAlmanac(
  projectId: string,
  raw: string,
): Promise<AlmanacImportResult | { error: string }> {
  const parsed = parseAlmanacFile(raw)
  if (!parsed.ok) return { error: parsed.reason }

  const existing = (await codexRepo.list()).filter((e) => e.projectId === projectId)
  const plan = planAlmanacImport(parsed.file.entries, existing)

  // Images first, so entries can point at real assets from the start.
  const imageIdByRef = new Map<string, string>()
  const wanted = new Set(plan.create.map((e) => e.imageId).filter(Boolean))
  for (const image of parsed.file.images) {
    if (!wanted.has(image.id)) continue
    try {
      const bytes = base64ToBytes(image.base64)
      const asset = await imageAssetRepo.create({
        blob: new Blob([bytes.buffer as ArrayBuffer], { type: image.mimeType }),
        mimeType: image.mimeType,
        width: 0,
        height: 0,
        fileName: 'almanac-import',
      })
      imageIdByRef.set(image.id, asset.id)
    } catch {
      // A corrupt image loses its picture, not the entry wearing it.
    }
  }

  // Two passes: every entry needs its new id to exist before any
  // relationship can point at it. Skipped entries still resolve — a link to
  // Tomas should reach the Tomas already living here.
  const newIdByRef = new Map<string, string>(plan.matchedByRef)
  const created: CodexEntry[] = []
  for (const entry of plan.create) {
    const row = await codexRepo.create({
      projectId,
      seriesId: null,
      type: entry.type,
      name: entry.name,
      aliases: entry.aliases ?? [],
      summary: entry.summary ?? '',
      body: entry.body ?? null,
      plainText: entry.plainText ?? '',
      attributes: entry.attributes ?? [],
      relationships: [],
      imageId: entry.imageId ? (imageIdByRef.get(entry.imageId) ?? null) : null,
      tags: entry.tags ?? [],
      aiContext: entry.aiContext ?? 'when-relevant',
      aiContextTokenBudget: entry.aiContextTokenBudget ?? null,
    })
    newIdByRef.set(entry.refId, row.id)
    created.push(row)
  }

  for (const [index, entry] of plan.create.entries()) {
    const relationships = remapRelationships(entry, newIdByRef)
    if (relationships.length > 0) {
      await codexRepo.update(created[index].id, { relationships })
    }
  }

  return { created: plan.create.length, skipped: plan.skipped }
}
