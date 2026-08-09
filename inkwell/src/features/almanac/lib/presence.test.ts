import { describe, expect, it } from 'vitest'

import { buildPresence, type PresenceChapter, type PresenceScene } from '@/features/almanac/lib/presence'

const chapters: PresenceChapter[] = [
  { chapterId: 'c1', title: 'Chapter 1', order: 0 },
  { chapterId: 'c2', title: 'Chapter 2', order: 1 },
  { chapterId: 'c3', title: 'Chapter 3', order: 2 },
  { chapterId: 'c4', title: 'Chapter 4', order: 3 },
  { chapterId: 'c5', title: 'Chapter 5', order: 4 },
]

describe('buildPresence', () => {
  it('marks which chapters name the entry, in order', () => {
    const scenes: PresenceScene[] = [
      { chapterId: 'c1', count: 2, wordCount: 1000 },
      { chapterId: 'c4', count: 1, wordCount: 1000 },
    ]
    const p = buildPresence(chapters, scenes)
    expect(p.chapters.map((c) => c.present)).toEqual([true, false, false, true, false])
    expect(p.chaptersPresent).toBe(2)
  })

  it('measures the longest interior absence in words, with a chapter span', () => {
    const scenes: PresenceScene[] = [
      { chapterId: 'c1', count: 1, wordCount: 1000 },
      { chapterId: 'c2', count: 0, wordCount: 4000 },
      { chapterId: 'c3', count: 0, wordCount: 4000 },
      { chapterId: 'c4', count: 0, wordCount: 3000 },
      { chapterId: 'c5', count: 1, wordCount: 1000 },
    ]
    const p = buildPresence(chapters, scenes)
    // Absent through chapters 2, 3, 4 = 11,000 words.
    expect(p.longestAbsenceWords).toBe(11000)
    expect(p.longestAbsenceSpan).toBe('Chapter 2–Chapter 4')
  })

  it('does not count absence before the first or after the last appearance', () => {
    const scenes: PresenceScene[] = [
      { chapterId: 'c3', count: 1, wordCount: 2000 },
    ]
    // Present only in ch3: no interior gap exists.
    const p = buildPresence(chapters, scenes)
    expect(p.longestAbsenceWords).toBe(0)
    expect(p.longestAbsenceSpan).toBeNull()
  })

  it('names a single-chapter gap by that chapter alone', () => {
    const scenes: PresenceScene[] = [
      { chapterId: 'c1', count: 1, wordCount: 1000 },
      { chapterId: 'c2', count: 0, wordCount: 5000 },
      { chapterId: 'c3', count: 1, wordCount: 1000 },
    ]
    const p = buildPresence(chapters.slice(0, 3), scenes)
    expect(p.longestAbsenceWords).toBe(5000)
    expect(p.longestAbsenceSpan).toBe('Chapter 2')
  })

  it('picks the longest of several gaps', () => {
    const scenes: PresenceScene[] = [
      { chapterId: 'c1', count: 1, wordCount: 500 },
      { chapterId: 'c2', count: 0, wordCount: 2000 },
      { chapterId: 'c3', count: 1, wordCount: 500 },
      { chapterId: 'c4', count: 0, wordCount: 6000 },
      { chapterId: 'c5', count: 1, wordCount: 500 },
    ]
    const p = buildPresence(chapters, scenes)
    expect(p.longestAbsenceWords).toBe(6000)
    expect(p.longestAbsenceSpan).toBe('Chapter 4')
  })

  it('handles an entry that never appears', () => {
    const p = buildPresence(chapters, [])
    expect(p.chaptersPresent).toBe(0)
    expect(p.longestAbsenceWords).toBe(0)
    expect(p.longestAbsenceSpan).toBeNull()
  })
})
