import { describe, expect, it } from 'vitest'

import type { AiPreset } from '@/types'

import { presetForFeature } from './feature-preset'

const preset = (id: string, isDefault = false): AiPreset =>
  ({
    id,
    createdAt: 0,
    updatedAt: 0,
    name: id,
    providerId: 'p',
    model: 'm',
    temperature: 0.7,
    topP: 1,
    isDefault,
    systemPrompt: '',
    proseInstructions: '',
    contextRules: {
      includeCodex: true,
      codexTokenBudget: 0,
      includeLorebook: true,
      lorebookTokenBudget: 0,
      precedingParagraphs: 3,
    },
  }) as AiPreset

describe('presetForFeature', () => {
  const presets = [preset('plain', true), preset('tidewriter'), preset('outliner')]

  it('uses the feature’s own choice when one is set', () => {
    expect(presetForFeature(presets, 'chat', { chat: 'tidewriter' })?.id).toBe('tidewriter')
  })

  it('falls back to the global default when the feature has no choice', () => {
    expect(presetForFeature(presets, 'chat', {})?.id).toBe('plain')
    expect(presetForFeature(presets, 'editorActions', { chat: 'tidewriter' })?.id).toBe('plain')
  })

  it('falls back the same way when the chosen preset was deleted', () => {
    expect(presetForFeature(presets, 'bookCreator', { bookCreator: 'gone' })?.id).toBe('plain')
  })

  it('degrades to the first preset when nothing is starred, and to nothing when none exist', () => {
    const unstarred = [preset('a'), preset('b')]
    expect(presetForFeature(unstarred, 'chat', {})?.id).toBe('a')
    expect(presetForFeature([], 'chat', {})).toBeUndefined()
  })
})
