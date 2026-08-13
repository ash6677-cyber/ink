import type { BaseEntity } from './base'

export type CodexEntryType =
  'character' | 'location' | 'item' | 'faction' | 'lore' | 'concept' | 'other'

export type AiContextInclusion = 'always' | 'never' | 'when-relevant'

export interface CodexRelationship {
  id: string
  targetEntryId: string
  label: string
}

export interface CodexAttribute {
  id: string
  key: string
  value: string
}

/** A pin on a world map, in normalized image coordinates (0..1 each way),
 * so the same pin lands on the same mountain at every zoom and size. */
export interface MapPin {
  id: string
  x: number
  y: number
  /** The Almanac entry this pin is, or null for a plain marker. */
  entryId: string | null
  label: string
}

/**
 * A world map: the writer's own image — hand-drawn, generated, scanned —
 * with pins linking places on it to Almanac entries. Entirely local;
 * the image lives in imageAssets like every other picture here.
 */
export interface WorldMap extends BaseEntity {
  projectId: string
  name: string
  imageId: string
  pins: MapPin[]
}

export interface CodexEntry extends BaseEntity {
  projectId: string | null
  seriesId: string | null
  type: CodexEntryType
  name: string
  aliases: string[]
  summary: string
  body: unknown
  plainText: string
  attributes: CodexAttribute[]
  relationships: CodexRelationship[]
  imageId: string | null
  tags: string[]
  aiContext: AiContextInclusion
  aiContextTokenBudget: number | null
}
