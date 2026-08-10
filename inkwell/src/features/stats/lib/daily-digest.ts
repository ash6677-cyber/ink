/**
 * The "Today I wrote" digest.
 *
 * At the end of a writing day the numbers are scattered: words landed in
 * session logs, the scenes you touched only know it by their timestamps,
 * and a finished sprint vanished with its dialog. This gathers one day's
 * work into a single card — words, time at the desk, which scenes moved,
 * the best sprint — so closing the laptop comes with a receipt.
 *
 * Pure functions over plain data; the sprint log's storage is injected so
 * everything here is testable without a browser.
 */

export interface DigestSession {
  projectId: string
  wordsWritten: number
  startedAt: number
  endedAt?: number | null
}

export interface DigestScene {
  id: string
  title: string
  projectId: string
  updatedAt: number
}

export interface SprintResult {
  words: number
  minutes: number
  endedAt: number
  projectId: string | null
}

export interface DailyDigest {
  words: number
  /** Sessions that logged words today. */
  sittings: number
  /** Minutes spent across today's sittings (each at least one minute —
   * a sitting that logged words took time, however brief). */
  minutes: number
  /** Scenes edited today, most recent first. */
  scenesTouched: { id: string; title: string }[]
  /** Today's most productive finished sprint, if any were run. */
  bestSprint: SprintResult | null
}

function startOfDay(millis: number): number {
  const date = new Date(millis)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** One day's work, gathered. Scoped to a project when one is given. */
export function buildDigest(input: {
  sessions: DigestSession[]
  scenes: DigestScene[]
  sprints: SprintResult[]
  now: number
  projectId?: string | null
}): DailyDigest {
  const { sessions, scenes, sprints, now, projectId } = input
  const dayStart = startOfDay(now)
  const inScope = <T extends { projectId: string | null }>(x: T) =>
    projectId === null || projectId === undefined || x.projectId === projectId

  const todays = sessions.filter(
    (s) => s.startedAt >= dayStart && s.startedAt <= now && inScope(s) && s.wordsWritten > 0,
  )
  const words = todays.reduce((sum, s) => sum + s.wordsWritten, 0)
  const minutes = todays.reduce((sum, s) => {
    const span = Math.max(0, (s.endedAt ?? s.startedAt) - s.startedAt)
    return sum + Math.max(1, Math.round(span / 60000))
  }, 0)

  const scenesTouched = scenes
    .filter((s) => s.updatedAt >= dayStart && s.updatedAt <= now && inScope(s))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((s) => ({ id: s.id, title: s.title }))

  const todaysSprints = sprints.filter(
    (s) => s.endedAt >= dayStart && s.endedAt <= now && inScope(s),
  )
  const bestSprint = todaysSprints.reduce<SprintResult | null>(
    (best, s) => (best === null || s.words > best.words ? s : best),
    null,
  )

  return { words, sittings: todays.length, minutes, scenesTouched, bestSprint }
}

/* ------------------------------------------------------------------ *
 *  Sprint log — finished sprints, kept so the digest can name the    *
 *  day's best. Mid-sprint state stays deliberately unpersisted; only *
 *  the outcome of a completed sprint is written here.                *
 * ------------------------------------------------------------------ */

const SPRINT_LOG_KEY = 'inkwell-sprint-log'
const KEEP_DAYS = 14

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Parse the stored log, tolerating a corrupt or missing value. */
export function readSprintLog(storage: StorageLike): SprintResult[] {
  try {
    const raw = storage.getItem(SPRINT_LOG_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (x): x is SprintResult =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as SprintResult).words === 'number' &&
        typeof (x as SprintResult).minutes === 'number' &&
        typeof (x as SprintResult).endedAt === 'number',
    )
  } catch {
    return []
  }
}

/** Append a finished sprint, pruning entries older than two weeks. */
export function appendSprintResult(
  storage: StorageLike,
  result: SprintResult,
): SprintResult[] {
  const cutoff = startOfDay(result.endedAt) - KEEP_DAYS * 24 * 60 * 60 * 1000
  const log = [...readSprintLog(storage).filter((s) => s.endedAt >= cutoff), result]
  storage.setItem(SPRINT_LOG_KEY, JSON.stringify(log))
  return log
}
