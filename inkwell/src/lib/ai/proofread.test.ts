import { describe, expect, it } from 'vitest'

import {
  buildProofreadMessages,
  parseProofreadSuggestions,
} from '@/lib/ai/proofread'

const passage =
  'She walked to the the door and opened it quietly. The room was was empty, ' +
  'and the silence felt heavy. The heavy curtains stirred.'

describe('buildProofreadMessages', () => {
  it('asks for a JSON array and includes the passage', () => {
    const messages = buildProofreadMessages(passage)
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toMatch(/JSON array/i)
    expect(messages[1].content).toContain(passage)
  })
})

describe('parseProofreadSuggestions', () => {
  it('accepts a clean JSON array of applicable fixes', () => {
    const raw = JSON.stringify([
      { category: 'repeat', original: 'the the door', suggestion: 'the door', explanation: 'Doubled "the".' },
      { category: 'repeat', original: 'was was empty', suggestion: 'was empty', explanation: 'Doubled "was".' },
    ])
    const out = parseProofreadSuggestions(raw, { passage })
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ category: 'repeat', original: 'the the door', suggestion: 'the door' })
  })

  it('drops suggestions whose original is not verbatim in the passage', () => {
    const raw = JSON.stringify([
      { category: 'typo', original: 'a word that never appears', suggestion: 'x', explanation: '' },
      { category: 'repeat', original: 'the the door', suggestion: 'the door', explanation: '' },
    ])
    const out = parseProofreadSuggestions(raw, { passage })
    expect(out).toHaveLength(1)
    expect(out[0].original).toBe('the the door')
  })

  it('tolerates code fences and chatter around the array', () => {
    const raw = 'Sure! Here are the fixes:\n```json\n' +
      JSON.stringify([{ category: 'repeat', original: 'was was empty', suggestion: 'was empty', explanation: '' }]) +
      '\n```\nHope that helps.'
    const out = parseProofreadSuggestions(raw, { passage })
    expect(out).toHaveLength(1)
  })

  it('returns nothing for an empty array, junk, or non-arrays', () => {
    expect(parseProofreadSuggestions('[]', { passage })).toEqual([])
    expect(parseProofreadSuggestions('not json at all', { passage })).toEqual([])
    expect(parseProofreadSuggestions('{"category":"typo"}', { passage })).toEqual([])
  })

  it('drops no-op fixes and collapses duplicates', () => {
    const raw = JSON.stringify([
      { category: 'style', original: 'heavy', suggestion: 'heavy', explanation: 'no change' },
      { category: 'echo', original: 'heavy', suggestion: 'weighty', explanation: 'echo' },
      { category: 'echo', original: 'heavy', suggestion: 'weighty', explanation: 'echo again' },
    ])
    const out = parseProofreadSuggestions(raw, { passage })
    expect(out).toHaveLength(1)
    expect(out[0].suggestion).toBe('weighty')
  })

  it('falls back to the style category for an unknown one, and honours the limit', () => {
    const raw = JSON.stringify([
      { category: 'nonsense', original: 'quietly', suggestion: 'softly', explanation: '' },
    ])
    const out = parseProofreadSuggestions(raw, { passage, limit: 1 })
    expect(out).toHaveLength(1)
    expect(out[0].category).toBe('style')
  })

  it('allows a deletion (empty-string suggestion)', () => {
    const raw = JSON.stringify([
      { category: 'repeat', original: ' was', suggestion: '', explanation: 'delete stray word' },
    ])
    const out = parseProofreadSuggestions(raw, { passage })
    expect(out[0].suggestion).toBe('')
  })
})
