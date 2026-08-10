import type { BaseEntity } from './base'

export interface ExampleDialogueLine {
  id: string
  input: string
  response: string
}

export interface CropSettings {
  x: number
  y: number
  zoom: number
}

/**
 * The border and silhouette a card is cut to.
 *
 * Not decoration for its own sake. A cast of thirty portraits in identical
 * rounded rectangles is a contact sheet; giving a writer a way to cut the
 * villain differently from the love interest is how a wall of faces becomes
 * scannable.
 */
export type CardFrame = 'plain' | 'inlay' | 'arch' | 'plate' | 'shard'

/**
 * How the card's surface takes light.
 *
 * Matte absorbs, satin gives a soft sheen, foil catches a hard specular line,
 * and holo splits it into spectrum. These are surfaces rather than colours —
 * the same accent looks like a different card on each.
 */
export type CardFinish = 'matte' | 'satin' | 'foil' | 'holo'

/**
 * What a card looks like, as distinct from who is on it.
 *
 * Optional on the record, and absent on every card made before this existed:
 * a card with no design is drawn the way it always was, so nothing anyone
 * already made changes appearance by the app being updated.
 */
export interface CardDesign {
  frame: CardFrame
  finish: CardFinish
  /**
   * The card's own colour as an `oklch()` string, or null to follow the
   * app's accent — so a writer who has not chosen keeps tracking the theme
   * rather than being pinned to whatever the accent happened to be that day.
   */
  accent: string | null
  /** How hard the finish catches light, 0–1. */
  gloss: number
  /** Strength of the vignette pulling focus to the face, 0–1. */
  vignette: number
}

export interface CharacterCard extends BaseEntity {
  projectId: string
  codexEntryId: string | null
  displayName: string
  avatarImageId: string | null
  cropSettings: CropSettings | null
  /** Absent on cards made before card design existed. */
  design?: CardDesign
  description: string
  personality: string
  scenario: string
  firstMessage: string
  exampleDialogue: ExampleDialogueLine[]
  systemPromptOverride: string | null
  voiceNotes: string
  tags: string[]
}

export type ChatRole = 'user' | 'assistant' | 'system'
export type ChatMode = 'interview' | 'roleplay'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  swipes: string[]
  activeSwipe: number
}

export interface CardChat extends BaseEntity {
  cardId: string
  projectId: string
  mode: ChatMode
  title: string
  personaId: string | null
  aiPresetId: string | null
  messages: ChatMessage[]
  /** When set, this chat is a discussion of one scene: its prose rides in
   * the prompt. Absent on every chat made before scene discussions existed. */
  sceneId?: string | null
}

export interface Persona extends BaseEntity {
  name: string
  description: string
  avatarImageId: string | null
  isDefault: boolean
}
