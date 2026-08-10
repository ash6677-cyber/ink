import { describe, expect, it } from 'vitest'

import { buildYearReview } from '@/features/stats/lib/year-review'

const at = (y: number, m: number, d: number, words: number) => ({
  wordsWritten: words,
  startedAt: new Date(y, m, d, 10, 0).getTime(),
})

describe('buildYearReview', () => {
  it('totals only the requested year', () => {
    const r = buildYearReview(
      [at(2026, 0, 5, 500), at(2026, 6, 1, 700), at(2025, 11, 31, 9000)],
      2026,
    )
    expect(r.totalWords).toBe(1200)
    expect(r.year).toBe(2026)
  })

  it('folds several sessions on one day into one writing day', () => {
    const r = buildYearReview([at(2026, 2, 3, 300), at(2026, 2, 3, 400)], 2026)
    expect(r.daysWritten).toBe(1)
    expect(r.biggestDay?.words).toBe(700)
  })

  it('finds the longest consecutive-day streak', () => {
    const r = buildYearReview(
      [
        at(2026, 0, 1, 100),
        at(2026, 0, 2, 100),
        at(2026, 0, 3, 100),
        // gap
        at(2026, 0, 10, 100),
        at(2026, 0, 11, 100),
      ],
      2026,
    )
    expect(r.longestStreak).toBe(3)
  })

  it('names the biggest single day', () => {
    const r = buildYearReview([at(2026, 3, 1, 200), at(2026, 3, 2, 1500), at(2026, 3, 3, 900)], 2026)
    expect(r.biggestDay).toEqual({ day: new Date(2026, 3, 2).setHours(0, 0, 0, 0), words: 1500 })
  })

  it('buckets words into all twelve months', () => {
    const r = buildYearReview([at(2026, 0, 1, 100), at(2026, 11, 31, 250)], 2026)
    expect(r.monthlyWords).toHaveLength(12)
    expect(r.monthlyWords[0]).toBe(100)
    expect(r.monthlyWords[11]).toBe(250)
    expect(r.monthlyWords.slice(1, 11).every((w) => w === 0)).toBe(true)
  })

  it('ignores zero-word sessions', () => {
    const r = buildYearReview([at(2026, 5, 5, 0)], 2026)
    expect(r.daysWritten).toBe(0)
    expect(r.biggestDay).toBeNull()
  })

  it('is empty-safe', () => {
    expect(buildYearReview([], 2026)).toEqual({
      year: 2026,
      totalWords: 0,
      daysWritten: 0,
      longestStreak: 0,
      biggestDay: null,
      monthlyWords: Array.from({ length: 12 }, () => 0),
    })
  })
})
