/**
 * The year in review.
 *
 * A year of writing disappears into itself — session by session, day by
 * day, none of it visible from inside. This folds a calendar year of
 * session logs into the shape of the year: total words, days at the desk,
 * the longest unbroken run, the single biggest day, where the months rose
 * and fell. Pure arithmetic; the shareable card is drawn from what this
 * returns.
 */

export interface ReviewSession {
  wordsWritten: number
  startedAt: number
  projectId?: string
}

export interface YearReview {
  year: number
  totalWords: number
  /** Calendar days with at least one word. */
  daysWritten: number
  /** The longest run of consecutive writing days. */
  longestStreak: number
  /** The single biggest day, or null for a year with nothing in it. */
  biggestDay: { day: number; words: number } | null
  /** Words per month, January first, all twelve present. */
  monthlyWords: number[]
}

function dayKey(millis: number): number {
  const d = new Date(millis)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Folds one calendar year of sessions. Sessions outside `year` are ignored. */
export function buildYearReview(sessions: ReviewSession[], year: number): YearReview {
  const inYear = sessions.filter(
    (s) => new Date(s.startedAt).getFullYear() === year && s.wordsWritten > 0,
  )

  const byDay = new Map<number, number>()
  const monthlyWords = Array.from({ length: 12 }, () => 0)
  let totalWords = 0
  for (const session of inYear) {
    totalWords += session.wordsWritten
    const day = dayKey(session.startedAt)
    byDay.set(day, (byDay.get(day) ?? 0) + session.wordsWritten)
    monthlyWords[new Date(session.startedAt).getMonth()] += session.wordsWritten
  }

  let biggestDay: YearReview['biggestDay'] = null
  for (const [day, words] of byDay) {
    if (biggestDay === null || words > biggestDay.words) biggestDay = { day, words }
  }

  // Longest streak: walk the writing days in order, counting runs where
  // each day is exactly one calendar day after the last.
  const days = [...byDay.keys()].sort((a, b) => a - b)
  const ONE_DAY = 24 * 60 * 60 * 1000
  let longestStreak = 0
  let run = 0
  let prev: number | null = null
  for (const day of days) {
    // Timestamps are local-midnight anchored, so a DST shift can make the
    // gap 23 or 25 hours; anything under a day and a half is "the next day".
    run = prev !== null && day - prev < 1.5 * ONE_DAY ? run + 1 : 1
    longestStreak = Math.max(longestStreak, run)
    prev = day
  }

  return { year, totalWords, daysWritten: days.length, longestStreak, biggestDay, monthlyWords }
}
