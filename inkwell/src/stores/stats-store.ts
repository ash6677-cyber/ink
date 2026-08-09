import { create } from 'zustand'

import { goalRepo, sessionLogRepo } from '@/lib/db/repositories'
import type { Goal, SessionLog } from '@/types'

/** A writing session is considered over after this long without a word
 * being written, so a lunch break doesn't read as one eight-hour sitting. */
const SESSION_IDLE_MS = 15 * 60 * 1000

export const DEFAULT_DAILY_TARGET = 500

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface StatsState {
  goals: Goal[]
  sessions: SessionLog[]
  status: LoadStatus

  loadAll: () => Promise<void>
  /** Records words written for a project, folding into the current session
   * if one is still open. */
  recordProgress: (projectId: string, wordsWritten: number) => Promise<void>
  setDailyTarget: (projectId: string | null, target: number) => Promise<void>
  setDeadline: (projectId: string | null, deadline: number | null) => Promise<void>
  goalFor: (projectId: string | null) => Goal | undefined
}

function startOfDay(millis: number): number {
  const date = new Date(millis)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * Progress is recorded from the editor's autosave, which can fire again
 * before the previous write has landed. Serialising the writes means two
 * saves a few hundred milliseconds apart both fold into one session instead
 * of each deciding, from the same stale snapshot, to start a new one.
 */
let writeQueue: Promise<unknown> = Promise.resolve()

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(task, task)
  writeQueue = next.catch(() => undefined)
  return next
}

export const useStatsStore = create<StatsState>((set, get) => ({
  goals: [],
  sessions: [],
  status: 'idle',

  loadAll: async () => {
    set({ status: 'loading' })
    try {
      const [goals, sessions] = await Promise.all([goalRepo.list(), sessionLogRepo.list()])
      set({
        goals,
        sessions: sessions.sort((a, b) => b.startedAt - a.startedAt),
        status: 'ready',
      })
    } catch {
      set({ status: 'error' })
    }
  },

  recordProgress: async (projectId, wordsWritten) => {
    if (wordsWritten <= 0) return
    await serialize(async () => {
      // The editor records progress whether or not anyone has opened the
      // Stats page, so load history first — otherwise every save would look
      // like the first of the day and start its own session.
      if (get().status !== 'ready') await get().loadAll()

      const now = Date.now()

      // Extend the most recent session for this project if it's still live;
      // otherwise this is the start of a new sitting.
      const open = get().sessions.find(
        (session) =>
          session.projectId === projectId &&
          now - (session.endedAt ?? session.startedAt) < SESSION_IDLE_MS,
      )

      if (open) {
        const updated: SessionLog = {
          ...open,
          wordsWritten: open.wordsWritten + wordsWritten,
          endedAt: now,
        }
        await sessionLogRepo.update(open.id, {
          wordsWritten: updated.wordsWritten,
          endedAt: now,
        })
        set({
          sessions: get()
            .sessions.map((session) => (session.id === open.id ? updated : session))
            .sort((a, b) => b.startedAt - a.startedAt),
        })
        return
      }

      const created = await sessionLogRepo.create({
        projectId,
        wordsWritten,
        startedAt: now,
        endedAt: now,
      })
      set({ sessions: [created, ...get().sessions] })
    })
  },

  setDailyTarget: async (projectId, target) => {
    const existing = get().goals.find((goal) => goal.projectId === projectId)
    if (existing) {
      await goalRepo.update(existing.id, { dailyWordTarget: target, active: true })
      set({
        goals: get().goals.map((goal) =>
          goal.id === existing.id ? { ...goal, dailyWordTarget: target, active: true } : goal,
        ),
      })
      return
    }
    const created = await goalRepo.create({ projectId, dailyWordTarget: target, active: true })
    set({ goals: [...get().goals, created] })
  },

  setDeadline: async (projectId, deadline) => {
    const existing = get().goals.find((goal) => goal.projectId === projectId)
    if (existing) {
      await goalRepo.update(existing.id, { deadline })
      set({
        goals: get().goals.map((goal) =>
          goal.id === existing.id ? { ...goal, deadline } : goal,
        ),
      })
      return
    }
    // No goal record yet: a deadline implies one, at the default target.
    const created = await goalRepo.create({
      projectId,
      dailyWordTarget: DEFAULT_DAILY_TARGET,
      active: true,
      deadline,
    })
    set({ goals: [...get().goals, created] })
  },

  goalFor: (projectId) => {
    const goals = get().goals
    return goals.find((goal) => goal.projectId === projectId) ?? goals.find((g) => g.projectId === null)
  },
}))

export interface DayTotal {
  day: number
  words: number
}

/** Words per calendar day for the last `days` days, oldest first, including
 * days with nothing written so the chart has an unbroken time axis. */
export function dailyTotals(sessions: SessionLog[], days: number, projectId?: string): DayTotal[] {
  const relevant = projectId ? sessions.filter((s) => s.projectId === projectId) : sessions
  const byDay = new Map<number, number>()
  for (const session of relevant) {
    const day = startOfDay(session.startedAt)
    byDay.set(day, (byDay.get(day) ?? 0) + session.wordsWritten)
  }

  const today = startOfDay(Date.now())
  const oneDay = 24 * 60 * 60 * 1000
  const totals: DayTotal[] = []
  for (let i = days - 1; i >= 0; i--) {
    const day = today - i * oneDay
    totals.push({ day, words: byDay.get(day) ?? 0 })
  }
  return totals
}

/**
 * Consecutive days ending today (or yesterday) that met the target.
 *
 * Yesterday counts as the anchor so a streak isn't reported as broken
 * simply because the writer hasn't sat down yet this morning.
 */
export function currentStreak(totals: DayTotal[], target: number): number {
  if (totals.length === 0) return 0
  let streak = 0
  const lastIndex = totals.length - 1
  const todayMet = totals[lastIndex].words >= target && target > 0

  for (let i = todayMet ? lastIndex : lastIndex - 1; i >= 0; i--) {
    if (target > 0 && totals[i].words >= target) streak += 1
    else break
  }
  return streak
}

export function wordsToday(totals: DayTotal[]): number {
  return totals.length > 0 ? totals[totals.length - 1].words : 0
}
