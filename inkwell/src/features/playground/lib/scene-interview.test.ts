import { describe, expect, it } from 'vitest'

import {
  cardsForScene,
  discussionChatTitle,
  scenePassage,
  type InterviewScene,
} from '@/features/playground/lib/scene-interview'
import { estimateTokens } from '@/lib/ai/token-estimate'
import type { CharacterCard } from '@/types'

function card(name: string, codexEntryId: string | null = null): CharacterCard {
  return {
    id: `card-${name}`,
    createdAt: 0,
    updatedAt: 0,
    projectId: 'p1',
    codexEntryId,
    displayName: name,
    avatarImageId: null,
    cropSettings: null,
    description: '',
    personality: '',
    scenario: '',
    firstMessage: '',
    exampleDialogue: [],
    systemPromptOverride: null,
    voiceNotes: '',
    tags: [],
  } as unknown as CharacterCard
}

const scene: InterviewScene = {
  id: 's1',
  title: 'The ford',
  plainText: 'Marta waded first. Behind her, Tomas hesitated at the water. The ford was high.',
  povCharacterId: 'codex-marta',
  linkedCodexIds: ['codex-tomas'],
}

describe('cardsForScene', () => {
  it('ranks POV, then linked, then named-in-prose', () => {
    const cards = [
      card('Tomas', 'codex-tomas'),
      card('Marta', 'codex-marta'),
      card('The Ferryman'), // not present anywhere
      card('Ford'), // named in prose ("The ford") — whole-word, case-insensitive
    ]
    const ranked = cardsForScene(cards, scene)
    expect(ranked.map((r) => `${r.card.displayName}:${r.reason}`)).toEqual([
      'Marta:pov',
      'Tomas:linked',
      'Ford:named',
    ])
  })

  it('matches names as whole words only', () => {
    const ranked = cardsForScene([card('Art')], {
      ...scene,
      plainText: 'Marta looked away.', // "Art" inside "Marta" must not hit
      povCharacterId: null,
      linkedCodexIds: [],
    })
    expect(ranked).toEqual([])
  })

  it('offers nothing when nobody fits', () => {
    expect(
      cardsForScene([card('Stranger')], { ...scene, plainText: '', povCharacterId: null, linkedCodexIds: [] }),
    ).toEqual([])
  })
})

describe('discussionChatTitle', () => {
  it('names the chat after the scene, untitled-safe', () => {
    expect(discussionChatTitle('The ford')).toBe('Discussing “The ford”')
    expect(discussionChatTitle('  ')).toBe('Discussing “Untitled scene”')
  })
})

describe('scenePassage', () => {
  it('keeps whole paragraphs within the budget', () => {
    const text = 'First paragraph here.\n\nSecond paragraph follows.\n\nThird one too.'
    // A budget with room for exactly the first two paragraphs, measured
    // with the same estimator the passage builder uses.
    const budget =
      estimateTokens('First paragraph here.') + estimateTokens('Second paragraph follows.')
    const passage = scenePassage(text, budget)
    expect(passage).toBe('First paragraph here.\n\nSecond paragraph follows.')
  })

  it('always keeps at least one paragraph, and all of them when room allows', () => {
    const text = 'Only paragraph, longer than any tiny budget could hold, kept anyway.'
    expect(scenePassage(text, 1)).toBe(text)
    expect(scenePassage('A.\n\nB.', 10_000)).toBe('A.\n\nB.')
  })
})
