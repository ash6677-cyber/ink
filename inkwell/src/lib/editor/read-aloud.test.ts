import { describe, expect, it } from 'vitest'

import { chunkForSpeech } from '@/lib/editor/read-aloud'

describe('chunkForSpeech', () => {
  it('splits on sentence boundaries, keeping terminators', () => {
    expect(chunkForSpeech('The tide came in. It went out again! Did it?')).toEqual([
      'The tide came in.',
      'It went out again!',
      'Did it?',
    ])
  })

  it('collapses whitespace and trims', () => {
    expect(chunkForSpeech('  Hello   there.\n\nHow are   you?  ')).toEqual([
      'Hello there.',
      'How are you?',
    ])
  })

  it('returns nothing for empty or whitespace-only text', () => {
    expect(chunkForSpeech('')).toEqual([])
    expect(chunkForSpeech('   \n  ')).toEqual([])
  })

  it('keeps a terminator-less final fragment', () => {
    expect(chunkForSpeech('No full stop here')).toEqual(['No full stop here'])
  })

  it('breaks an over-long sentence on word boundaries, never mid-word', () => {
    const long = `${'word '.repeat(80)}end.`.trim() // ~400 chars, no sentence breaks
    const chunks = chunkForSpeech(long, 60)
    expect(chunks.length).toBeGreaterThan(1)
    // Every chunk within the cap.
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(60)
    // Rejoining recovers the original word sequence — nothing split mid-word,
    // nothing lost.
    expect(chunks.join(' ').split(/\s+/)).toEqual(long.split(/\s+/))
  })

  it('keeps a chunk within the cap when the words allow it', () => {
    const chunks = chunkForSpeech('one two three four five six seven eight nine ten', 20)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(20)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('leaves an unbreakable token whole rather than losing it', () => {
    // A single token longer than the cap cannot be split; it survives intact.
    const token = 'x'.repeat(50)
    expect(chunkForSpeech(`tiny ${token} tail`, 20).join(' ')).toContain(token)
  })
})
