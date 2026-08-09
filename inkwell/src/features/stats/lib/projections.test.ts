import { describe, expect, it } from 'vitest'

import { DAY_MS, deadlineVerdict, project, recentPace } from './projections'

const day = (offset: number, words: number) => ({ day: offset * DAY_MS, words })
const NOW = 100 * DAY_MS

describe('recentPace', () => {
  it('averages over the window with the zero days counted', () => {
    // 1,000 words every Saturday is not a 1,000-a-day writer.
    const totals = Array.from({ length: 14 }, (_, i) => day(i, i % 7 === 0 ? 1000 : 0))
    expect(recentPace(totals)).toBeCloseTo(2000 / 14)
  })

  it('reads only the last fourteen days of a longer axis', () => {
    const totals = [
      ...Array.from({ length: 30 }, (_, i) => day(i, 5000)), // ancient glory
      ...Array.from({ length: 14 }, (_, i) => day(30 + i, 100)),
    ]
    expect(recentPace(totals)).toBe(100)
  })

  it('is zero with no history', () => {
    expect(recentPace([])).toBe(0)
  })
})

describe('project', () => {
  const steady = Array.from({ length: 14 }, (_, i) => day(i, 500))

  it('projects the finish from remaining words over honest pace', () => {
    const p = project(30000, 80000, steady, NOW)
    expect(p.wordsRemaining).toBe(50000)
    expect(p.daysToFinish).toBe(100)
    expect(p.projectedFinish).toBe(NOW + 100 * DAY_MS)
  })

  it('a met target projects "now" with nothing remaining', () => {
    const p = project(80000, 80000, steady, NOW)
    expect(p.wordsRemaining).toBe(0)
    expect(p.daysToFinish).toBe(0)
  })

  it('refuses to invent a date when there is no pace', () => {
    const p = project(10, 80000, [], NOW)
    expect(p.projectedFinish).toBeNull()
    expect(p.daysToFinish).toBeNull()
  })
})

describe('deadlineVerdict', () => {
  it('computes the required pace from days left', () => {
    const v = deadlineVerdict(10000, 500, NOW + 20 * DAY_MS, NOW)
    expect(v.daysLeft).toBe(20)
    expect(v.requiredPace).toBe(500)
    expect(v.onPace).toBe(true)
  })

  it('says so when the pace falls short', () => {
    const v = deadlineVerdict(10000, 100, NOW + 20 * DAY_MS, NOW)
    expect(v.requiredPace).toBe(500)
    expect(v.onPace).toBe(false)
  })

  it('a deadline today asks for everything today', () => {
    const v = deadlineVerdict(3000, 100, NOW, NOW)
    expect(v.daysLeft).toBe(0)
    expect(v.requiredPace).toBe(3000)
  })

  it('a finished book is on pace regardless', () => {
    const v = deadlineVerdict(0, 0, NOW - DAY_MS, NOW)
    expect(v.onPace).toBe(true)
    expect(v.requiredPace).toBe(0)
  })
})
