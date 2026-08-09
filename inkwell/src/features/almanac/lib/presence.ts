/**
 * Presence across the book.
 *
 * The appearances list answers "which scenes name this character". Presence
 * answers the shape of it: which chapters they carry, and — the useful,
 * uncomfortable part — how long they vanish. A protagonist absent for three
 * chapters and eleven thousand words is a thing a writer wants to see, and
 * a scene list buried in the middle of a book never shows it.
 *
 * Pure arithmetic over ordered chapters and per-scene mention counts.
 */

export interface PresenceScene {
  chapterId: string
  count: number
  wordCount: number
}

export interface PresenceChapter {
  chapterId: string
  title: string
  order: number
}

export interface ChapterPresence {
  chapterId: string
  title: string
  /** Total mentions of the entry in this chapter. */
  mentions: number
  /** Words in this chapter, for weighting the gap. */
  words: number
  present: boolean
}

export interface PresenceSummary {
  chapters: ChapterPresence[]
  /** How many chapters name the entry at least once. */
  chaptersPresent: number
  /** The longest run of consecutive chapters where the entry never appears,
   * measured in words — the "absent for N words" number. */
  longestAbsenceWords: number
  /** Human span of that gap, e.g. "Chapter 4–6", or null if never absent
   * between appearances. */
  longestAbsenceSpan: string | null
}

/**
 * Builds the chapter-by-chapter presence map and the longest interior
 * absence (a gap only counts between the first and last appearance — a
 * character not yet introduced, or already gone, isn't "absent").
 */
export function buildPresence(
  chapters: PresenceChapter[],
  scenes: PresenceScene[],
): PresenceSummary {
  const ordered = [...chapters].sort((a, b) => a.order - b.order)

  const mentionsByChapter = new Map<string, number>()
  const wordsByChapter = new Map<string, number>()
  for (const scene of scenes) {
    mentionsByChapter.set(scene.chapterId, (mentionsByChapter.get(scene.chapterId) ?? 0) + scene.count)
    wordsByChapter.set(scene.chapterId, (wordsByChapter.get(scene.chapterId) ?? 0) + scene.wordCount)
  }

  const presence: ChapterPresence[] = ordered.map((chapter) => {
    const mentions = mentionsByChapter.get(chapter.chapterId) ?? 0
    return {
      chapterId: chapter.chapterId,
      title: chapter.title,
      mentions,
      words: wordsByChapter.get(chapter.chapterId) ?? 0,
      present: mentions > 0,
    }
  })

  const firstIdx = presence.findIndex((c) => c.present)
  const lastIdx = presence.map((c) => c.present).lastIndexOf(true)

  let longestAbsenceWords = 0
  let longestAbsenceSpan: string | null = null
  if (firstIdx !== -1 && lastIdx > firstIdx) {
    let runWords = 0
    let runStart = -1
    for (let i = firstIdx + 1; i < lastIdx; i++) {
      if (!presence[i].present) {
        if (runStart === -1) runStart = i
        runWords += presence[i].words
        // Peek: close the run at its end.
        const runEnds = i + 1 >= lastIdx || presence[i + 1].present
        if (runEnds && runWords > longestAbsenceWords) {
          longestAbsenceWords = runWords
          longestAbsenceSpan =
            runStart === i
              ? presence[runStart].title
              : `${presence[runStart].title}–${presence[i].title}`
        }
        if (runEnds) {
          runWords = 0
          runStart = -1
        }
      }
    }
  }

  return {
    chapters: presence,
    chaptersPresent: presence.filter((c) => c.present).length,
    longestAbsenceWords,
    longestAbsenceSpan,
  }
}
