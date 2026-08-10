import { describe, expect, it } from 'vitest'

import { bookPacing, dialogueWords, sceneTempo, sentenceLengths } from './pacing'

const scene = (overrides: Partial<Parameters<typeof sceneTempo>[0]> = {}) => ({
  sceneId: 's1',
  title: 'A scene',
  chapterTitle: 'Chapter 1',
  plainText: '',
  ...overrides,
})

/** N words of quiet, long-sentence prose — no quotes, ~26 words a sentence. */
const quietProse = (words: number) => {
  const sentence =
    'The river moved past the old stone bridge without hurry while the town behind it slept on under a sky the colour of unpolished tin and regret.'
  const per = sentence.split(' ').length
  return Array.from({ length: Math.ceil(words / per) }, () => sentence).join(' ')
}

/** N words where roughly half sit inside double quotes, in short sentences. */
const chattyProse = (words: number) => {
  const unit = '"We go now." She nodded once. "Fine then." He grabbed the coat quickly.'
  const per = unit.split(/\s+/).length
  return Array.from({ length: Math.ceil(words / per) }, () => unit).join(' ')
}

describe('dialogueWords', () => {
  it('counts words inside straight double quotes', () => {
    expect(dialogueWords('She said, "come home before dark" and left.')).toBe(4)
  })

  it('counts words inside curly quotes too', () => {
    expect(dialogueWords('“Not tonight,” he said. “Maybe never.”')).toBe(4)
  })

  it('sums across several exchanges', () => {
    expect(dialogueWords('"Yes." A pause. "No." Another. "We shall see."')).toBe(5)
  })

  it('returns zero for narration with no quotes', () => {
    expect(dialogueWords('The house stood empty for forty years.')).toBe(0)
  })

  it('returns zero for empty text', () => {
    expect(dialogueWords('')).toBe(0)
  })
})

describe('sentenceLengths', () => {
  it('splits on terminal punctuation and counts words', () => {
    expect(sentenceLengths('One two three. Four five! Six?')).toEqual([3, 2, 1])
  })

  it('handles a trailing sentence without punctuation', () => {
    expect(sentenceLengths('First done. and then it simply stopped')).toEqual([2, 5])
  })

  it('is empty for empty text', () => {
    expect(sentenceLengths('')).toEqual([])
  })
})

describe('sceneTempo', () => {
  it('reads a short scene as brisk', () => {
    const t = sceneTempo(scene({ plainText: quietProse(300) }))
    expect(t.tempo).toBe('brisk')
    expect(t.dialogueRatio).toBe(0)
  })

  it('reads a talkative scene as brisk even at length', () => {
    const t = sceneTempo(scene({ plainText: chattyProse(1200) }))
    expect(t.dialogueRatio).toBeGreaterThan(0.35)
    expect(t.tempo).toBe('brisk')
  })

  it('reads a long quiet scene as slow', () => {
    const t = sceneTempo(scene({ plainText: quietProse(1800) }))
    expect(t.words).toBeGreaterThanOrEqual(1600)
    expect(t.dialogueRatio).toBeLessThanOrEqual(0.12)
    expect(t.tempo).toBe('slow')
  })

  it('reads a mid-length mixed scene as measured', () => {
    const text = `${quietProse(500)} ${chattyProse(500)}`
    const t = sceneTempo(scene({ plainText: text }))
    expect(t.tempo).toBe('measured')
  })

  it('a long scene with plenty of dialogue and short sentences is not slow', () => {
    // ~20% dialogue: above QUIET, and the chatty half drags avg sentence length down.
    const text = `${quietProse(1000)} ${chattyProse(800)}`
    const t = sceneTempo(scene({ plainText: text }))
    expect(t.words).toBeGreaterThanOrEqual(1600)
    expect(t.tempo).not.toBe('slow')
  })

  it('is safe on an empty scene', () => {
    const t = sceneTempo(scene({ plainText: '' }))
    expect(t.words).toBe(0)
    expect(t.dialogueRatio).toBe(0)
    expect(t.avgSentenceLength).toBe(0)
    expect(t.tempo).toBe('brisk')
  })
})

describe('bookPacing', () => {
  const quick = (id: string) => scene({ sceneId: id, title: id, plainText: chattyProse(400) })
  const heavy = (id: string) => scene({ sceneId: id, title: id, plainText: quietProse(1800) })

  it('flags a run of three slow scenes as a stretch', () => {
    const pacing = bookPacing([quick('a'), heavy('b'), heavy('c'), heavy('d'), quick('e')])
    expect(pacing.stretches).toHaveLength(1)
    expect(pacing.stretches[0].from).toBe(1)
    expect(pacing.stretches[0].to).toBe(3)
    expect(pacing.stretches[0].sceneTitles).toEqual(['b', 'c', 'd'])
    expect(pacing.stretches[0].words).toBeGreaterThan(5000)
  })

  it('does not flag only two slow scenes in a row', () => {
    const pacing = bookPacing([heavy('a'), heavy('b'), quick('c')])
    expect(pacing.stretches).toEqual([])
  })

  it('flags a slow run that ends the book', () => {
    const pacing = bookPacing([quick('a'), heavy('b'), heavy('c'), heavy('d')])
    expect(pacing.stretches).toHaveLength(1)
    expect(pacing.stretches[0].to).toBe(3)
  })

  it('finds two separate stretches', () => {
    const pacing = bookPacing([
      heavy('a'), heavy('b'), heavy('c'),
      quick('d'),
      heavy('e'), heavy('f'), heavy('g'), heavy('h'),
    ])
    expect(pacing.stretches.map((s) => [s.from, s.to])).toEqual([
      [0, 2],
      [4, 7],
    ])
  })

  it('computes the median scene length', () => {
    const pacing = bookPacing([quick('a'), quick('b'), heavy('c')])
    const words = pacing.scenes.map((s) => s.words).sort((x, y) => x - y)
    expect(pacing.medianWords).toBe(words[1])
  })

  it('averages the middle pair for an even count', () => {
    const pacing = bookPacing([quick('a'), heavy('b')])
    const [lo, hi] = pacing.scenes.map((s) => s.words).sort((x, y) => x - y)
    expect(pacing.medianWords).toBe(Math.round((lo + hi) / 2))
  })

  it('is safe on an empty book', () => {
    const pacing = bookPacing([])
    expect(pacing).toEqual({ scenes: [], stretches: [], medianWords: 0 })
  })
})
