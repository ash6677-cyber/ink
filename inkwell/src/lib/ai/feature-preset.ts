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

export type AiFeature = 'chat' | 'editorActions' | 'bookCreator'

export const AI_FEATURE_LABEL: Record<AiFeature, string> = {
  editorActions: 'Editor actions',
  chat: 'Character chat',
  bookCreator: 'Book Creator',
}

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
