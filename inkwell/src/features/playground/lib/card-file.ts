/**
 * Characters as files, so a cast can leave the app.
 *
 * Same posture as `theme-file.ts`: plain versioned JSON going out, and
 * field-by-field validation coming in — a card file is untrusted input, and
 * every string in it ends up rendered, stored, or handed to the AI context
 * builder. The portrait travels inside the file as a data URL, because a
 * character arriving without their face is half a character.
 *
 * The same JSON also rides inside an exported PNG (see `png-chunks.ts`),
 * which is the character-card ecosystem's de-facto interchange: the picture
 * *is* the card.
 */

import type { CardDesign, ExampleDialogueLine } from '@/types'

import { FINISHES, FRAMES } from './card-design'

export const CARD_FILE_KIND = 'inkwell-character-card'
export const CARD_FILE_VERSION = 1
/** The tEXt keyword a card PNG stores its JSON under (base64-encoded). */
export const CARD_PNG_KEYWORD = 'inkwell-card'

export interface CardFileData {
  displayName: string
  description: string
  personality: string
  scenario: string
  firstMessage: string
  exampleDialogue: { input: string; response: string }[]
  voiceNotes: string
  tags: string[]
  design?: CardDesign
  /** The portrait as a `data:image/...` URL, when the card has one. */
  avatarDataUrl?: string
}

export function cardToFile(data: CardFileData): string {
  return `${JSON.stringify(
    {
      kind: CARD_FILE_KIND,
      version: CARD_FILE_VERSION,
      ...data,
    },
    null,
    2,
  )}\n`
}

function readString(value: unknown, max = 20000): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 20)
}

function readDialogue(value: unknown): { input: string; response: string }[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((line): line is Record<string, unknown> => Boolean(line) && typeof line === 'object')
    .map((line) => ({ input: readString(line.input), response: readString(line.response) }))
    .filter((line) => line.input || line.response)
    .slice(0, 100)
}

function readNumber01(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}

function readDesign(value: unknown): CardDesign | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  return {
    frame: (FRAMES.includes(raw.frame as never) ? raw.frame : 'plain') as CardDesign['frame'],
    finish: (FINISHES.includes(raw.finish as never)
      ? raw.finish
      : 'matte') as CardDesign['finish'],
    // The accent feeds CSS; anything that is not a plausible oklch() string
    // is treated as "follow the theme" rather than trusted.
    accent:
      typeof raw.accent === 'string' && /^oklch\([^)]{1,80}\)$/.test(raw.accent)
        ? raw.accent
        : null,
    gloss: readNumber01(raw.gloss, 0.5),
    vignette: readNumber01(raw.vignette, 0.55),
  }
}

/**
 * Only `data:image/...` URLs survive — a card file must never be able to
 * make the app fetch an arbitrary web address just by being imported.
 */
function readAvatar(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value)) return undefined
  // ~8MB of base64 is already a very large portrait; beyond it, refuse
  // rather than let one file balloon the library.
  if (value.length > 8 * 1024 * 1024) return undefined
  return value
}

/**
 * Reads a card file, or returns null if it isn't one. Null rather than an
 * exception for the same reason as themes: handing the picker the wrong
 * file is an ordinary act, not an exceptional condition.
 */
export function readCardFile(text: string): CardFileData | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null

  const file = parsed as Record<string, unknown>
  if (file.kind !== CARD_FILE_KIND) return null

  const displayName = readString(file.displayName, 120).trim()
  return {
    displayName: displayName || 'Imported character',
    description: readString(file.description),
    personality: readString(file.personality),
    scenario: readString(file.scenario),
    firstMessage: readString(file.firstMessage),
    exampleDialogue: readDialogue(file.exampleDialogue),
    voiceNotes: readString(file.voiceNotes),
    tags: readTags(file.tags),
    design: readDesign(file.design),
    avatarDataUrl: readAvatar(file.avatarDataUrl),
  }
}

/** Fresh ids for imported dialogue lines — ids never travel between libraries. */
export function dialogueWithIds(
  lines: { input: string; response: string }[],
): ExampleDialogueLine[] {
  return lines.map((line) => ({ id: crypto.randomUUID(), ...line }))
}
