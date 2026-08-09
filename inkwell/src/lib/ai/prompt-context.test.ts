import { describe, expect, it } from 'vitest'

import { buildChatPrompt } from './chat-prompt-builder'
import { omittedItems, sentItems } from './context-plan'
import { buildPrompt } from './prompt-builder'
import type {
  AiPreset,
  CardChat,
  CharacterCard,
  CodexEntry,
  Lorebook,
  LorebookEntry,
} from '@/types'

const preset = (changes: Partial<AiPreset> = {}): AiPreset =>
  ({
    id: 'preset-1',
    createdAt: 0,
    updatedAt: 0,
    name: 'Default',
    providerId: 'p',
    model: 'm',
    temperature: 0.8,
    topP: 1,
    isDefault: true,
    systemPrompt: '',
    proseInstructions: '',
    contextRules: {
      includeCodex: true,
      codexTokenBudget: 0,
      includeLorebook: true,
      lorebookTokenBudget: 0,
      precedingParagraphs: 3,
    },
    ...changes,
  }) as AiPreset

const entry = (changes: Partial<CodexEntry> & { name: string }): CodexEntry =>
  ({
    id: `e-${changes.name}`,
    createdAt: 0,
    updatedAt: 0,
    projectId: 'p1',
    seriesId: null,
    type: 'character',
    aliases: [],
    summary: `${changes.name} summary`,
    body: null,
    plainText: '',
    attributes: [],
    relationships: [],
    imageId: null,
    tags: [],
    aiContext: 'when-relevant',
    aiContextTokenBudget: null,
    ...changes,
  }) as CodexEntry

function promptText(built: { messages: { content: string }[] }): string {
  return built.messages.map((m) => m.content).join('\n')
}

describe('the Almanac in an editor prompt', () => {
  const base = {
    preset: preset(),
    action: 'continue' as const,
    instruction: '',
    precedingText: 'Mira crossed the bridge at dusk.',
    codexEntries: [] as CodexEntry[],
    pov: 'third-limited' as const,
    tense: 'past' as const,
  }

  it('never sends an entry set to never, and says that is why', () => {
    // The whole point of the setting. If it leaked, the writer's only clue
    // would be prose that knows something it shouldn't.
    const secret = entry({ name: 'Mira', aiContext: 'never', summary: 'SECRET' })
    const built = buildPrompt({ ...base, codexEntries: [secret] })
    expect(promptText(built)).not.toContain('SECRET')
    const omitted = omittedItems(built.plan)
    expect(omitted.map((i) => i.label)).toEqual(['Mira'])
    expect(omitted[0].reason).toMatch(/never/i)
  })

  it('sends an "always" entry even when nothing mentions it', () => {
    const always = entry({ name: 'Zzyzx', aiContext: 'always', summary: 'ALWAYS' })
    const built = buildPrompt({ ...base, codexEntries: [always] })
    expect(promptText(built)).toContain('ALWAYS')
    expect(sentItems(built.plan).map((i) => i.label)).toContain('Zzyzx')
  })

  it('explains a "when relevant" entry that was not mentioned', () => {
    const quiet = entry({ name: 'Tomas', summary: 'QUIET' })
    const built = buildPrompt({ ...base, codexEntries: [quiet] })
    expect(promptText(built)).not.toContain('QUIET')
    expect(omittedItems(built.plan)[0].reason).toMatch(/not mentioned/i)
  })

  it('includes one that is mentioned, by name or by alias', () => {
    const named = entry({ name: 'Mira', summary: 'BY NAME' })
    expect(promptText(buildPrompt({ ...base, codexEntries: [named] }))).toContain('BY NAME')
    const aliased = entry({ name: 'Someone', aliases: ['the bridge'], summary: 'BY ALIAS' })
    expect(promptText(buildPrompt({ ...base, codexEntries: [aliased] }))).toContain('BY ALIAS')
  })

  it('says when the budget ran out rather than dropping silently', () => {
    // The first fits comfortably; the second cannot, and must say so rather
    // than simply not appearing.
    const many = [
      entry({ name: 'Mira', aiContext: 'always', summary: 'A trader.' }),
      entry({ name: 'Tomas', aiContext: 'always', summary: 'y '.repeat(300) }),
    ]
    const built = buildPrompt({
      ...base,
      preset: preset({
        contextRules: { ...preset().contextRules, codexTokenBudget: 40 },
      }),
      codexEntries: many,
    })
    expect(sentItems(built.plan).map((i) => i.label)).toContain('Mira')
    const omitted = omittedItems(built.plan)
    expect(omitted.map((i) => i.label)).toEqual(['Tomas'])
    expect(omitted[0].reason).toMatch(/budget/i)
  })

  it('honours an entry’s own token budget, and the preview says it was cut', () => {
    const capped = entry({
      name: 'Mira',
      aiContext: 'always',
      summary: 'long '.repeat(200),
      aiContextTokenBudget: 30,
    })
    const built = buildPrompt({ ...base, codexEntries: [capped] })
    const item = built.plan.items.find((i) => i.label === 'Mira')
    expect(item?.outcome).toBe('trimmed')
    expect(item?.reason).toMatch(/own 30-token budget/)
    expect(item?.tokens).toBeLessThanOrEqual(30)
    // No budget set means no cap — same entry, unclipped.
    const free = buildPrompt({
      ...base,
      codexEntries: [entry({ name: 'Mira', aiContext: 'always', summary: 'long '.repeat(200) })],
    })
    expect(free.plan.items.find((i) => i.label === 'Mira')?.outcome).toBe('included')
  })

  it('accounts for every entry exactly once, sent or not', () => {
    const entries = [
      entry({ name: 'A', aiContext: 'never' }),
      entry({ name: 'B', aiContext: 'always' }),
      entry({ name: 'C' }),
    ]
    const built = buildPrompt({ ...base, codexEntries: entries })
    const named = built.plan.items.filter((i) => entries.some((e) => e.name === i.label))
    expect(named.map((i) => i.label).sort()).toEqual(['A', 'B', 'C'])
  })

  it('explains a preset that has Almanac context switched off entirely', () => {
    const built = buildPrompt({
      ...base,
      preset: preset({ contextRules: { ...preset().contextRules, includeCodex: false } }),
      codexEntries: [entry({ name: 'Mira', aiContext: 'always' })],
    })
    expect(omittedItems(built.plan)[0].reason).toMatch(/switched off/i)
  })
})

describe('lorebooks in a chat prompt', () => {
  const card = {
    id: 'c1',
    displayName: 'Mira',
    description: '',
    personality: '',
    scenario: '',
    firstMessage: '',
    voiceNotes: '',
    exampleDialogue: [],
    systemPromptOverride: null,
    tags: [],
  } as unknown as CharacterCard

  const chat = { id: 'chat', mode: 'roleplay', messages: [] } as unknown as CardChat

  const lorebook = (entries: Partial<LorebookEntry>[]): Lorebook =>
    ({
      id: 'lb',
      createdAt: 0,
      updatedAt: 0,
      projectId: 'p1',
      name: 'Salt Road lore',
      entries: entries.map((e, i) => ({
        id: `le-${i}`,
        keywords: ['salt'],
        content: 'CONTENT',
        constant: false,
        priority: 0,
        tokenBudget: 0,
        enabled: true,
        ...e,
      })),
    }) as Lorebook

  const history = [
    { id: 'm1', role: 'user', content: 'Tell me about the salt tax.', createdAt: 0, swipes: [], activeSwipe: 0 },
  ] as CardChat['messages']

  it('injects an entry whose keyword was actually said', () => {
    const built = buildChatPrompt({
      card,
      chat,
      persona: null,
      lorebooks: [lorebook([{ content: 'THE TAX' }])],
      preset: preset(),
      history,
    })
    expect(promptText(built)).toContain('THE TAX')
  })

  it('explains an entry whose keyword never came up', () => {
    const built = buildChatPrompt({
      card,
      chat,
      persona: null,
      lorebooks: [lorebook([{ keywords: ['dragon'], content: 'DRAGONS' }])],
      preset: preset(),
      history,
    })
    expect(promptText(built)).not.toContain('DRAGONS')
    expect(omittedItems(built.plan)[0].reason).toMatch(/keywords/i)
  })

  it('explains one that is switched off, even though its keyword matched', () => {
    // Two entries can be absent for opposite reasons, and the difference is
    // the only thing that tells a writer what to do next.
    const built = buildChatPrompt({
      card,
      chat,
      persona: null,
      lorebooks: [lorebook([{ enabled: false, content: 'OFF' }])],
      preset: preset(),
      history,
    })
    expect(promptText(built)).not.toContain('OFF')
    expect(omittedItems(built.plan)[0].reason).toMatch(/switched off/i)
  })

  it('sends a constant entry whether or not anything matched', () => {
    const built = buildChatPrompt({
      card,
      chat,
      persona: null,
      lorebooks: [lorebook([{ keywords: ['nothing'], constant: true, content: 'ALWAYS ON' }])],
      preset: preset(),
      history,
    })
    expect(promptText(built)).toContain('ALWAYS ON')
  })

  it('marks a trimmed entry as sent, and says it was cut', () => {
    const built = buildChatPrompt({
      card,
      chat,
      persona: null,
      lorebooks: [lorebook([{ content: 'salt '.repeat(500) }])],
      preset: preset({
        contextRules: { ...preset().contextRules, lorebookTokenBudget: 20 },
      }),
      history,
    })
    const trimmed = built.plan.items.find((i) => i.outcome === 'trimmed')
    expect(trimmed?.reason).toMatch(/cut short/i)
    expect(sentItems(built.plan)).toContain(trimmed)
  })

  it('names the lorebook an entry came from', () => {
    const built = buildChatPrompt({
      card,
      chat,
      persona: null,
      lorebooks: [lorebook([{}])],
      preset: preset(),
      history,
    })
    expect(built.plan.items.some((i) => i.source === 'Salt Road lore')).toBe(true)
  })

  it('always accounts for the character and the conversation itself', () => {
    const built = buildChatPrompt({
      card,
      chat,
      persona: null,
      lorebooks: [],
      preset: preset(),
      history,
    })
    const labels = built.plan.items.map((i) => i.label)
    expect(labels.some((l) => l.includes('Mira'))).toBe(true)
    expect(labels.some((l) => l.includes('conversation so far'))).toBe(true)
  })
})
