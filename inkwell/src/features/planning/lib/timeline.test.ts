import { describe, expect, it } from 'vitest'

import { buildTimeline, dayLabel, type TimelineScene } from '@/features/planning/lib/timeline'

function s(id: string, order: number, storyDay: number | null): TimelineScene {
  return { id, title: id, chapterTitle: 'Ch', storyDay, order }
}

describe('buildTimeline', () => {
  it('groups dated scenes by ascending story-day', () => {
    const t = buildTimeline([s('a', 0, 3), s('b', 1, 1), s('c', 2, 3)])
    expect(t.days.map((d) => d.day)).toEqual([1, 3])
    expect(t.days[1].scenes.map((x) => x.id)).toEqual(['a', 'c']) // same day, reading order
  })

  it('separates undated scenes in reading order', () => {
    const t = buildTimeline([s('a', 2, null), s('b', 0, 5), s('c', 1, null)])
    expect(t.undated.map((x) => x.id)).toEqual(['c', 'a'])
    expect(t.days.map((d) => d.day)).toEqual([5])
  })

  it('detects a reversal when reading order runs ahead of story time', () => {
    // Reading order a(day5), b(day2): the story jumps backward — a reversal.
    expect(buildTimeline([s('a', 0, 5), s('b', 1, 2)]).hasReversal).toBe(true)
  })

  it('reports no reversal when story time only advances', () => {
    expect(buildTimeline([s('a', 0, 1), s('b', 1, 1), s('c', 2, 4)]).hasReversal).toBe(false)
  })

  it('handles negative days (flashbacks) in order', () => {
    const t = buildTimeline([s('a', 0, 1), s('b', 1, -30)])
    expect(t.days.map((d) => d.day)).toEqual([-30, 1])
    // Reading a(1) then b(-30) is a jump backward.
    expect(t.hasReversal).toBe(true)
  })

  it('is empty-safe', () => {
    expect(buildTimeline([])).toEqual({ days: [], undated: [], hasReversal: false })
  })
})

describe('dayLabel', () => {
  it('labels positive and negative days', () => {
    expect(dayLabel(3)).toBe('Day 3')
    expect(dayLabel(-30)).toBe('Day −30')
  })
})
