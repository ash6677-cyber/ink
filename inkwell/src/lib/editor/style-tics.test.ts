import { describe, expect, it } from 'vitest'

import {
  buildTicRegex,
  countTics,
  normaliseTics,
  parseTicList,
  totalTicHits,
} from '@/lib/editor/style-tics'

describe('normaliseTics', () => {
  it('trims, lowercases, dedupes, and drops blanks, keeping order', () => {
    expect(normaliseTics([' Just', 'just', 'VERY', '', '  ', 'suddenly'])).toEqual([
      'just',
      'very',
      'suddenly',
    ])
  })
})

describe('parseTicList', () => {
  it('splits on commas and newlines', () => {
    expect(parseTicList('just, very\nsuddenly,,\n  really ')).toEqual([
      'just',
      'very',
      'suddenly',
      'really',
    ])
  })
})

describe('countTics', () => {
  const text = 'He just smiled. She just laughed. It was very, very quiet, and just so.'

  it('counts each watchword on whole-word boundaries', () => {
    const counts = countTics(text, ['just', 'very'])
    expect(counts).toEqual([
      { word: 'just', count: 3 },
      { word: 'very', count: 2 },
    ])
  })

  it('never matches inside a larger word', () => {
    // "just" must not fire inside "adjust"/"justice"; "very" not in "every".
    const counts = countTics('Every judge will adjust to justice.', ['very', 'just'])
    expect(counts).toEqual([
      { word: 'very', count: 0 },
      { word: 'just', count: 0 },
    ])
  })

  it('matches multi-word tics and prefers the longest', () => {
    const counts = countTics('All of a sudden it was sudden again.', ['sudden', 'all of a sudden'])
    // The phrase consumes its own "sudden"; only the standalone one remains.
    expect(counts).toEqual([
      { word: 'sudden', count: 1 },
      { word: 'all of a sudden', count: 1 },
    ])
  })

  it('is case-insensitive', () => {
    expect(countTics('Just JUST just', ['just'])).toEqual([{ word: 'just', count: 3 }])
  })

  it('returns nothing for an empty watchlist', () => {
    expect(countTics(text, [])).toEqual([])
  })

  it('includes zero-count words so the whole list is scored', () => {
    expect(countTics('nothing here', ['just', 'very'])).toEqual([
      { word: 'just', count: 0 },
      { word: 'very', count: 0 },
    ])
  })
})

describe('buildTicRegex', () => {
  it('is null for an empty list', () => {
    expect(buildTicRegex([])).toBeNull()
  })
  it('escapes regex-special characters in a tic', () => {
    // A tic like "..." must be matched literally, not as "any three chars".
    const re = buildTicRegex(['a.b'])
    expect(re && 'axb'.match(re)).toBeNull()
  })
})

describe('totalTicHits', () => {
  it('sums across the watchlist', () => {
    expect(totalTicHits('just very just', ['just', 'very'])).toBe(3)
  })
})
