/**
 * "Discuss this scene with…" — the bridge from a scene to the Playground.
 *
 * The writer is inside a scene; the question is who to talk it over with.
 * Rank the cast honestly: the scene's POV character first, then characters
 * the scene links to, then anyone actually named in its prose. Nothing
 * clever — the ranking must be explainable in one breath.
 */

import { estimateTokens } from '@/lib/ai/token-estimate'
import type { CharacterCard } from '@/types'

export interface InterviewScene {
  id: string
  title: string
  plainText: string
  povCharacterId: string | null
  linkedCodexIds: string[]
}

export type InterviewReason = 'pov' | 'linked' | 'named'

export interface InterviewCandidate {
  card: CharacterCard
  reason: InterviewReason
}

const REASON_RANK: Record<InterviewReason, number> = { pov: 0, linked: 1, named: 2 }

function namedInText(name: string, text: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|\\P{L})${escaped}(\\P{L}|$)`, 'iu').test(text)
}

/** The cards worth offering for this scene, best reason first. */
export function cardsForScene(
  cards: CharacterCard[],
  scene: InterviewScene,
): InterviewCandidate[] {
  const out: InterviewCandidate[] = []
  for (const card of cards) {
    let reason: InterviewReason | null = null
    if (card.codexEntryId && card.codexEntryId === scene.povCharacterId) {
      reason = 'pov'
    } else if (card.codexEntryId && scene.linkedCodexIds.includes(card.codexEntryId)) {
      reason = 'linked'
    } else if (namedInText(card.displayName, scene.plainText)) {
      reason = 'named'
    }
    if (reason) out.push({ card, reason })
  }
  return out.sort(
    (a, b) =>
      REASON_RANK[a.reason] - REASON_RANK[b.reason] ||
      a.card.displayName.localeCompare(b.card.displayName),
  )
}

export const REASON_LABEL: Record<InterviewReason, string> = {
  pov: 'POV of this scene',
  linked: 'Linked to this scene',
  named: 'Named in this scene',
}

/** The chat's name in the Playground list. */
export function discussionChatTitle(sceneTitle: string): string {
  return `Discussing “${sceneTitle.trim() || 'Untitled scene'}”`
}

/**
 * The scene's prose cut to a context budget, whole paragraphs kept —
 * a half-sentence of context reads worse than one paragraph fewer.
 */
export function scenePassage(plainText: string, tokenBudget: number): string {
  const paragraphs = plainText.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean)
  const kept: string[] = []
  let used = 0
  for (const paragraph of paragraphs) {
    const cost = estimateTokens(paragraph)
    if (used + cost > tokenBudget && kept.length > 0) break
    kept.push(paragraph)
    used += cost
    if (used >= tokenBudget) break
  }
  return kept.join('\n\n')
}
