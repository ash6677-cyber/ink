/**
 * Which preset a feature starts from.
 *
 * Chat wants different settings than outline generation — a looser
 * temperature, a persona-shaped system prompt — and one global default
 * forced every feature to share a single compromise. Each feature can now
 * name its own preset; anything unset falls back to the global default,
 * and a preset that has since been deleted falls back the same way rather
 * than leaving the feature pointing at nothing.
 */

import type { AiPreset } from '@/types'

export type AiFeature = 'chat' | 'editorActions' | 'bookCreator' | 'proofread' | 'continuity'

/** Every place a key can be pinned: the text features above, plus the one
 * image feature, which has no preset of its own. */
export type AiKeyedFeature = AiFeature | 'coverConcepts'

export const AI_FEATURE_LABEL: Record<AiFeature, string> = {
  editorActions: 'Editor actions',
  chat: 'Character chat',
  bookCreator: 'Book Creator',
  proofread: 'Proofread pass',
  continuity: 'Continuity sentinel',
}

export const AI_KEYED_FEATURE_LABEL: Record<AiKeyedFeature, string> = {
  ...AI_FEATURE_LABEL,
  coverConcepts: 'AI cover concepts',
}

/** Which key each feature runs on; a feature not in the map follows its
 * preset's provider, then the first working key. */
export type FeatureProviderMap = Partial<Record<AiKeyedFeature, string>>

export type FeaturePresetMap = Partial<Record<AiFeature, string>>

export function presetForFeature(
  presets: AiPreset[],
  feature: AiFeature,
  overrides: FeaturePresetMap,
): AiPreset | undefined {
  const chosenId = overrides[feature]
  const chosen = chosenId ? presets.find((p) => p.id === chosenId) : undefined
  return chosen ?? presets.find((p) => p.isDefault) ?? presets[0]
}
