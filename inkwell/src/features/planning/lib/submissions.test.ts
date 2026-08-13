import { describe, expect, it } from 'vitest'

import type { Submission, SubmissionStatus } from '@/types'

import {
  campaignSummary,
  daysOut,
  groupSubmissions,
  isOverdue,
  SUBMISSION_COLUMNS,
} from './submissions'

const DAY = 86_400_000
const NOW = 100 * DAY

let n = 0
const sub = (overrides: Partial<Submission>): Submission => ({
  id: `sub-${++n}`,
  createdAt: n,
  updatedAt: n,
  projectId: 'p1',
  market: `Market ${n}`,
  contact: '',
  status: 'queried' as SubmissionStatus,
  sentAt: NOW - 10 * DAY,
  respondBy: null,
  notes: '',
  ...overrides,
})

describe('isOverdue', () => {
  it('flags a waiting submission past its respond-by date', () => {
    expect(isOverdue(sub({ respondBy: NOW - DAY }), NOW)).toBe(true)
    expect(isOverdue(sub({ respondBy: NOW + DAY }), NOW)).toBe(false)
  })

  it('never flags one that has already resolved, however old', () => {
    expect(isOverdue(sub({ status: 'pass', respondBy: NOW - 30 * DAY }), NOW)).toBe(false)
    expect(isOverdue(sub({ status: 'offer', respondBy: NOW - 30 * DAY }), NOW)).toBe(false)
  })

  it('never flags one with no deadline at all', () => {
    expect(isOverdue(sub({ respondBy: null }), NOW)).toBe(false)
  })
})

describe('groupSubmissions', () => {
  it('gives every column a list, even empty ones', () => {
    const grouped = groupSubmissions([])
    expect(Object.keys(grouped)).toEqual(SUBMISSION_COLUMNS)
    expect(grouped.offer).toEqual([])
  })

  it('sorts waiting columns longest-out first and the shortlist by name', () => {
    const grouped = groupSubmissions([
      sub({ market: 'Newer', status: 'queried', sentAt: NOW - 2 * DAY }),
      sub({ market: 'Older', status: 'queried', sentAt: NOW - 20 * DAY }),
      sub({ market: 'Zeta Press', status: 'shortlist', sentAt: null }),
      sub({ market: 'Alpha Agency', status: 'shortlist', sentAt: null }),
    ])
    expect(grouped.queried.map((s) => s.market)).toEqual(['Older', 'Newer'])
    expect(grouped.shortlist.map((s) => s.market)).toEqual(['Alpha Agency', 'Zeta Press'])
  })
})

describe('campaignSummary', () => {
  it('reads the trail in one line', () => {
    const summary = campaignSummary(
      [
        sub({ status: 'queried' }),
        sub({ status: 'queried', respondBy: NOW - DAY }),
        sub({ status: 'full' }),
        sub({ status: 'pass' }),
      ],
      NOW,
    )
    expect(summary).toBe('3 out · 1 request · 1 overdue')
  })

  it('an offer eclipses everything else', () => {
    expect(campaignSummary([sub({ status: 'offer' }), sub({ status: 'queried' })], NOW)).toBe(
      '1 offer on the table',
    )
  })

  it('is honest when nothing is out', () => {
    expect(campaignSummary([sub({ status: 'pass' })], NOW)).toBe('Nothing out right now')
    expect(campaignSummary([], NOW)).toBe('')
  })
})

describe('daysOut', () => {
  it('counts whole days since sending, only while still waiting', () => {
    expect(daysOut(sub({ sentAt: NOW - 10 * DAY }), NOW)).toBe(10)
    expect(daysOut(sub({ status: 'pass', sentAt: NOW - 10 * DAY }), NOW)).toBeNull()
    expect(daysOut(sub({ sentAt: null }), NOW)).toBeNull()
  })
})
