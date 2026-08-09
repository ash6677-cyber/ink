import type { BaseEntity } from './base'

export interface Goal extends BaseEntity {
  projectId: string | null
  dailyWordTarget: number
  active: boolean
  /** Epoch ms of the day the book should be finished, or absent for none.
   * Optional-by-absence: goals recorded before deadlines existed stay valid. */
  deadline?: number | null
}

export interface SessionLog extends BaseEntity {
  projectId: string
  wordsWritten: number
  startedAt: number
  endedAt: number | null
}
