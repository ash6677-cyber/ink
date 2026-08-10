import { describe, expect, it } from 'vitest'

import {
  appendSprintResult,
  buildDigest,
  readSprintLog,
  type SprintResult,
} from '@/features/stats/lib/daily-digest'

// A fixed "now": 2026-06-10 21:30 local time.
const NOW = new Date(2026, 5, 10, 21, 30).getTime()
const TODAY_9AM = new Date(2026, 5, 10, 9, 0).getTime()
const TODAY_2PM = new Date(2026, 5, 10, 14, 0).getTime()
const YESTERDAY_9PM = new Date(2026, 5, 9, 21, 0).getTime()

const session = (over: Partial<Parameters<typeof buildDigest>[0]['sessions'][0]> = {}) => ({
  projectId: 'p1',
  wordsWritten: 500,
  startedAt: TODAY_9AM,
  endedAt: TODAY_9AM + 30 * 60000,
  ...over,
})

const scene = (id: string, updatedAt: number, projectId = 'p1') => ({
  id,
  title: `Scene ${id}`,
  projectId,
  updatedAt,
})

const sprint = (words: number, endedAt = TODAY_2PM, projectId: string | null = 'p1'): SprintResult => ({
  words,
  minutes: 25,
  endedAt,
  projectId,
})

describe('buildDigest', () => {
  it('sums only today’s sessions', () => {
    const d = buildDigest({
      sessions: [session(), session({ startedAt: YESTERDAY_9PM, endedAt: YESTERDAY_9PM + 60000 })],
      scenes: [],
      sprints: [],
      now: NOW,
    })
    expect(d.words).toBe(500)
    expect(d.sittings).toBe(1)
  })

  it('counts minutes per sitting with a one-minute floor', () => {
    const d = buildDigest({
      sessions: [
        session(), // 30 minutes
        session({ startedAt: TODAY_2PM, endedAt: TODAY_2PM + 10_000, wordsWritten: 40 }), // 10s → 1 min
      ],
      scenes: [],
      sprints: [],
      now: NOW,
    })
    expect(d.minutes).toBe(31)
    expect(d.sittings).toBe(2)
  })

  it('ignores zero-word sessions entirely', () => {
    const d = buildDigest({
      sessions: [session({ wordsWritten: 0 })],
      scenes: [],
      sprints: [],
      now: NOW,
    })
    expect(d.words).toBe(0)
    expect(d.sittings).toBe(0)
    expect(d.minutes).toBe(0)
  })

  it('lists today’s touched scenes newest-first, yesterday’s not at all', () => {
    const d = buildDigest({
      sessions: [],
      scenes: [scene('a', TODAY_9AM), scene('b', TODAY_2PM), scene('c', YESTERDAY_9PM)],
      sprints: [],
      now: NOW,
    })
    expect(d.scenesTouched.map((s) => s.id)).toEqual(['b', 'a'])
  })

  it('scopes to a project when one is given', () => {
    const d = buildDigest({
      sessions: [session(), session({ projectId: 'p2', wordsWritten: 900 })],
      scenes: [scene('a', TODAY_9AM), scene('x', TODAY_9AM, 'p2')],
      sprints: [sprint(100), sprint(999, TODAY_2PM, 'p2')],
      now: NOW,
      projectId: 'p1',
    })
    expect(d.words).toBe(500)
    expect(d.scenesTouched.map((s) => s.id)).toEqual(['a'])
    expect(d.bestSprint?.words).toBe(100)
  })

  it('picks today’s most productive sprint and ignores yesterday’s', () => {
    const d = buildDigest({
      sessions: [],
      scenes: [],
      sprints: [sprint(200), sprint(450), sprint(9000, YESTERDAY_9PM)],
      now: NOW,
    })
    expect(d.bestSprint?.words).toBe(450)
  })

  it('is empty-safe: a day with nothing reports nothing', () => {
    const d = buildDigest({ sessions: [], scenes: [], sprints: [], now: NOW })
    expect(d).toEqual({ words: 0, sittings: 0, minutes: 0, scenesTouched: [], bestSprint: null })
  })
})

describe('sprint log storage', () => {
  const memoryStorage = () => {
    const map = new Map<string, string>()
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    }
  }

  it('round-trips appended results', () => {
    const storage = memoryStorage()
    appendSprintResult(storage, sprint(300))
    appendSprintResult(storage, sprint(500))
    expect(readSprintLog(storage).map((s) => s.words)).toEqual([300, 500])
  })

  it('prunes entries older than two weeks', () => {
    const storage = memoryStorage()
    const old = sprint(100, NOW - 20 * 24 * 60 * 60 * 1000)
    appendSprintResult(storage, old)
    appendSprintResult(storage, sprint(200, NOW))
    expect(readSprintLog(storage).map((s) => s.words)).toEqual([200])
  })

  it('tolerates corrupt and missing stored values', () => {
    const storage = memoryStorage()
    expect(readSprintLog(storage)).toEqual([])
    storage.setItem('inkwell-sprint-log', '{not json')
    expect(readSprintLog(storage)).toEqual([])
    storage.setItem('inkwell-sprint-log', '{"an":"object"}')
    expect(readSprintLog(storage)).toEqual([])
  })
})
