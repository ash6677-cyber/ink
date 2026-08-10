import { describe, expect, it } from 'vitest'

import {
  PROVIDER_PROFILES,
  defaultModelFor,
  detectProviderKind,
  maskKey,
  providerProfile,
} from './provider-catalog'
import { canGenerate, presetsAwaitingProvider, resolveProvider } from './resolve-provider'
import type { AiPreset, AiProviderConfig } from '@/types'

const provider = (over: Partial<AiProviderConfig> = {}): AiProviderConfig =>
  ({
    id: 'p1',
    createdAt: 0,
    updatedAt: 0,
    kind: 'openai',
    label: 'OpenAI',
    apiKey: 'sk-abc',
    baseUrl: null,
    defaultModel: 'gpt-4o',
    enabled: true,
    ...over,
  }) as AiProviderConfig

const preset = (over: Partial<AiPreset> = {}): AiPreset =>
  ({
    id: 'x1',
    createdAt: 0,
    updatedAt: 0,
    name: 'Faithful prose',
    providerId: null,
    model: '',
    temperature: 0.7,
    topP: 1,
    systemPrompt: '',
    proseInstructions: '',
    isDefault: true,
    contextRules: {
      precedingParagraphs: 6,
      includeCodex: true,
      codexTokenBudget: 1200,
      includeLorebook: false,
      lorebookTokenBudget: 0,
    },
    ...over,
  }) as AiPreset

describe('recognising a pasted key', () => {
  it('tells Anthropic and OpenAI apart, which share a prefix', () => {
    expect(detectProviderKind('sk-ant-api03-xxxx')).toBe('anthropic')
    expect(detectProviderKind('sk-proj-xxxx')).toBe('openai')
    expect(detectProviderKind('sk-xxxx')).toBe('openai')
  })

  it('recognises OpenRouter', () => {
    expect(detectProviderKind('sk-or-v1-xxxx')).toBe('openrouter')
  })

  it('says nothing rather than guessing at a key it does not know', () => {
    // A wrong guess produces a failure the writer has no way to explain.
    expect(detectProviderKind('hf_xxxxxxxx')).toBeNull()
    expect(detectProviderKind('   ')).toBeNull()
    expect(detectProviderKind('')).toBeNull()
  })

  it('copes with a key pasted with whitespace around it', () => {
    expect(detectProviderKind('  sk-ant-api03-xxxx\n')).toBe('anthropic')
  })
})

describe('the catalogue', () => {
  it('offers a way to get a key for every real service', () => {
    for (const profile of PROVIDER_PROFILES) {
      if (profile.kind === 'openai-compatible') continue
      expect(profile.keyUrl).toMatch(/^https:\/\//)
      expect(profile.models.length).toBeGreaterThan(0)
      expect(profile.note.length).toBeGreaterThan(20)
    }
  })

  it('has a default model for every service it names', () => {
    expect(defaultModelFor('openrouter')).toBeTruthy()
    expect(defaultModelFor('anthropic')).toBeTruthy()
    expect(defaultModelFor('openai')).toBeTruthy()
  })

  it('falls back to a real profile rather than undefined', () => {
    expect(providerProfile('openai-compatible').needsBaseUrl).toBe(true)
  })
})

describe('showing a key back to its owner', () => {
  it('shows enough to recognise it and never enough to use it', () => {
    const masked = maskKey('sk-ant-api03-abcdefghijklmnop')
    expect(masked.startsWith('sk-ant')).toBe(true)
    expect(masked.endsWith('mnop')).toBe(true)
    expect(masked).not.toContain('api03-abcdefghij')
  })

  it('hides a short string completely instead of mostly revealing it', () => {
    expect(maskKey('sk-short')).toBe('••••••••')
    expect(maskKey('')).toBe('••••')
  })
})

describe('which key a preset actually uses', () => {
  it('uses the one the preset names', () => {
    const mine = provider({ id: 'p2', defaultModel: 'claude-sonnet-4-5' })
    const resolved = resolveProvider(preset({ providerId: 'p2' }), [provider(), mine])
    expect(resolved?.provider.id).toBe('p2')
    expect(resolved?.borrowed).toBe(false)
  })

  it('borrows the first working key when the preset names none', () => {
    // The bug this exists for: every shipped preset starts with no provider,
    // so a writer could add a key, pass its test, and still get no replies.
    const resolved = resolveProvider(preset(), [provider()])
    expect(resolved?.provider.id).toBe('p1')
    expect(resolved?.borrowed).toBe(true)
    expect(resolved?.model).toBe('gpt-4o')
  })

  it('borrows when the preset names a key that has since been deleted', () => {
    const resolved = resolveProvider(preset({ providerId: 'gone' }), [provider()])
    expect(resolved?.provider.id).toBe('p1')
    expect(resolved?.borrowed).toBe(true)
  })

  it('skips a key that is switched off or empty', () => {
    expect(resolveProvider(preset(), [provider({ enabled: false })])).toBeNull()
    expect(resolveProvider(preset(), [provider({ apiKey: '   ' })])).toBeNull()
  })

  it('a per-feature key choice beats the preset, and brings its own model', () => {
    const anthropic = provider({ id: 'p2', defaultModel: 'claude-sonnet-4-5' })
    const resolved = resolveProvider(
      preset({ providerId: 'p1', model: 'gpt-4o' }),
      [provider(), anthropic],
      'p2',
    )
    expect(resolved?.provider.id).toBe('p2')
    // The preset's model belongs to the other API family; the chosen key's
    // own default takes over.
    expect(resolved?.model).toBe('claude-sonnet-4-5')
    expect(resolved?.borrowed).toBe(false)
  })

  it('keeps the preset model when the per-feature choice IS the preset provider', () => {
    const resolved = resolveProvider(
      preset({ providerId: 'p1', model: 'gpt-4o-mini' }),
      [provider()],
      'p1',
    )
    expect(resolved?.provider.id).toBe('p1')
    expect(resolved?.model).toBe('gpt-4o-mini')
  })

  it('falls back to the preset path when the chosen key was deleted or disabled', () => {
    const resolved = resolveProvider(preset({ providerId: 'p1' }), [provider()], 'gone')
    expect(resolved?.provider.id).toBe('p1')
    expect(resolved?.borrowed).toBe(false)
  })

  it('prefers the preset’s own model over the provider’s default', () => {
    expect(resolveProvider(preset({ model: 'gpt-4o-mini' }), [provider()])?.model).toBe('gpt-4o-mini')
  })

  it('knows when nothing can be generated', () => {
    expect(canGenerate(preset(), [])).toBe(false)
    expect(canGenerate(preset(), [provider({ defaultModel: null })])).toBe(false)
    expect(canGenerate(preset(), [provider()])).toBe(true)
  })
})

describe('adopting a newly added key', () => {
  it('claims the presets that were never given one', () => {
    const waiting = presetsAwaitingProvider([preset({ id: 'a' }), preset({ id: 'b' })])
    expect(waiting.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('leaves alone a preset the writer deliberately pointed somewhere', () => {
    const waiting = presetsAwaitingProvider([preset({ id: 'a' }), preset({ id: 'b', providerId: 'local' })])
    expect(waiting.map((p) => p.id)).toEqual(['a'])
  })
})
