/**
 * When will this book be finished — answered from the writer's own record,
 * not from optimism.
 *
 * Pace is the mean of the last fourteen days of logged writing *including
 * the zero days*, because the zero days are real: a writer who does 1,000
 * words every Saturday writes 143 words a day, not 1,000. Projections from
 * that honest pace are the ones that survive contact with February.
 *
 * Pure functions over data the app already records (session logs, the
 * manuscript's live word count, the project's target) so every claim in the
 * Finishing card is reproducible in a test.
 */

import type { DayTotal } from '@/stores/stats-store'

export const DAY_MS = 24 * 60 * 60 * 1000
/** How much history the pace reads. Two weeks: long enough to smooth a bad
 * day, short enough to notice a writer who has genuinely sped up. */
export const PACE_WINDOW_DAYS = 14

export interface Projection {
  /** Words still to write; zero when the target is met or absent. */
  wordsRemaining: number
  /** Mean words per day over the window, zero days included. */
  pace: number
  /** Epoch ms of the projected finish day, or null when pace is zero. */
  projectedFinish: number | null
  /** Days from `now` to the projected finish, or null with no pace. */
  daysToFinish: number | null
}

export interface DeadlineVerdict {
  /** Words per day needed from today to hit the deadline. */
  requiredPace: number
  /** Days left until the deadline, never below zero. */
  daysLeft: number
  /** Whether the current pace meets the required one. */
  onPace: boolean
}

/** Mean daily words over the last `PACE_WINDOW_DAYS` entries of the axis. */
export function recentPace(totals: DayTotal[]): number {
  const window = totals.slice(-PACE_WINDOW_DAYS)
  if (window.length === 0) return 0
  const sum = window.reduce((acc, day) => acc + day.words, 0)
  return sum / window.length
}

export function project(
  manuscriptWords: number,
  targetWords: number,
  totals: DayTotal[],
  now: number,
): Projection {
  const wordsRemaining = Math.max(0, targetWords - manuscriptWords)
  const pace = recentPace(totals)
  if (wordsRemaining === 0) {
    return { wordsRemaining, pace, projectedFinish: now, daysToFinish: 0 }
  }
  if (pace <= 0) {
    return { wordsRemaining, pace: 0, projectedFinish: null, daysToFinish: null }
  }
  const daysToFinish = Math.ceil(wordsRemaining / pace)
  return { wordsRemaining, pace, projectedFinish: now + daysToFinish * DAY_MS, daysToFinish }
}

export function deadlineVerdict(
  wordsRemaining: number,
  pace: number,
  deadline: number,
  now: number,
): DeadlineVerdict {
  const daysLeft = Math.max(0, Math.ceil((deadline - now) / DAY_MS))
  // Floor at one writing day so "deadline is today" asks for the whole
  // remainder today rather than dividing by zero. A deadline already missed
  // reports the same: everything, now.
  const requiredPace =
    wordsRemaining === 0 ? 0 : Math.ceil(wordsRemaining / Math.max(1, daysLeft))
  return {
    requiredPace,
    daysLeft,
    onPace: wordsRemaining === 0 || pace >= requiredPace,
  }
}
