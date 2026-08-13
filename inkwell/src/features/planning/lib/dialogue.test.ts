import { describe, expect, it } from 'vitest'

import {
  attributeQuote,
  buildVoiceCheckMessages,
  extractDialogue,
  voiceStats,
} from './dialogue'

const scene = (plainText: string, sceneId = 's1') => ({
  sceneId,
  sceneTitle: 'A scene',
  chapterTitle: 'Chapter 1',
  plainText,
})

describe('attributeQuote', () => {
  it('reads "said Name" after the quote', () => {
    expect(attributeQuote('', ', said Marta, and turned away.')).toBe('Marta')
  })

  it('reads "Name said" after the quote', () => {
    expect(attributeQuote('', ' Tomas said quietly.')).toBe('Tomas')
  })

  it('reads "Name said" before the quote', () => {
    expect(attributeQuote('Marta said, ', ' The rest was silence.')).toBe('Marta')
  })

  it('refuses pronouns as names', () => {
    expect(attributeQuote('', ' she said.')).toBeNull()
    expect(attributeQuote('He said, ', '')).toBeNull()
  })

  it('returns null when nothing nearby tags a speaker', () => {
    expect(attributeQuote('The wind moved the curtains. ', ' Nobody moved.')).toBeNull()
  })

  it('prefers the tag after the quote over older text before it', () => {
    expect(attributeQuote('Marta said, "Go." A pause. ', ' said Tomas.')).toBe('Tomas')
  })
})

describe('extractDialogue', () => {
  it('lifts straight and curly quotes in reading order', () => {
    const lines = extractDialogue([
      scene('"First," said Marta. Then the room settled. “Second,” said Tomas.'),
    ])
    expect(lines.map((l) => l.quote)).toEqual(['First,', 'Second,'])
    expect(lines.map((l) => l.speaker)).toEqual(['Marta', 'Tomas'])
  })

  it('keeps untagged lines with a null speaker', () => {
    const lines = extractDialogue([scene('"Nobody has to know." The door closed.')])
    expect(lines).toHaveLength(1)
    expect(lines[0].speaker).toBeNull()
  })

  it('carries scene and chapter labels on every line', () => {
    const lines = extractDialogue([scene('"Here," said Ana.')])
    expect(lines[0].sceneTitle).toBe('A scene')
    expect(lines[0].chapterTitle).toBe('Chapter 1')
  })

  it('is empty for prose with no dialogue at all', () => {
    expect(extractDialogue([scene('The house stood empty for forty years.')])).toEqual([])
  })
})

describe('voiceStats', () => {
  const lines = extractDialogue([
    scene(
      '"Reckon we go north, reckon it tonight," said Bram. ' +
        '"Fine." said Ana. ' +
        '"Reckon the pass is shut," said Bram. ' +
        '"The maps say otherwise, the maps are old," said Ana. ' +
        '"Who goes there?"',
    ),
  ])

  it('orders voices loudest first with the unattributed remainder last', () => {
    const stats = voiceStats(lines)
    // Bram speaks 12 words to Ana's 9, so he leads the list.
    expect(stats.map((s) => s.speaker)).toEqual(['Bram', 'Ana', null])
  })

  it('counts lines, words, and shares that sum to one', () => {
    const stats = voiceStats(lines)
    const bram = stats.find((s) => s.speaker === 'Bram')!
    expect(bram.lines).toBe(2)
    expect(bram.words).toBe(12)
    expect(stats.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1)
  })

  it('finds a voice\'s pet words', () => {
    const stats = voiceStats(lines)
    expect(stats.find((s) => s.speaker === 'Bram')!.favourites).toContain('reckon')
    expect(stats.find((s) => s.speaker === 'Ana')!.favourites).toContain('maps')
  })

  it('is empty for no dialogue', () => {
    expect(voiceStats([])).toEqual([])
  })
})

describe('buildVoiceCheckMessages', () => {
  it('numbers every line with its scene and never asks for a rewrite', () => {
    const lines = extractDialogue([scene('"One," said Ana. "Two," said Ana.')])
    const messages = buildVoiceCheckMessages('Ana', lines)
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('Never rewrite')
    expect(messages[1].content).toContain('Character: Ana')
    expect(messages[1].content).toContain('1. (A scene) "One,"')
    expect(messages[1].content).toContain('2. (A scene) "Two,"')
  })
})
