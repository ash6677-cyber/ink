import { describe, expect, it } from 'vitest'

import {
  AUTO_BACKUP_INTERVAL_DAYS,
  autoBackupDue,
  nextAutoBackupAt,
} from '@/lib/db/auto-backup'

const DAY = 86_400_000
const NOW = 1_800_000_000_000

describe('autoBackupDue', () => {
  const base = { enabled: true, lastAutoBackupAt: null, now: NOW, words: 5000 }

  it('never runs when switched off', () => {
    expect(autoBackupDue({ ...base, enabled: false })).toBe(false)
  })

  it('skips a library with nothing worth keeping yet', () => {
    expect(autoBackupDue({ ...base, words: 100 })).toBe(false)
    expect(autoBackupDue({ ...base, words: 250 })).toBe(true)
  })

  it('runs immediately the first time', () => {
    expect(autoBackupDue(base)).toBe(true)
  })

  it('waits a week between runs', () => {
    expect(autoBackupDue({ ...base, lastAutoBackupAt: NOW - 3 * DAY })).toBe(false)
    expect(autoBackupDue({ ...base, lastAutoBackupAt: NOW - AUTO_BACKUP_INTERVAL_DAYS * DAY })).toBe(true)
  })

  it('treats a last-run in the future as due, never as never-again', () => {
    expect(autoBackupDue({ ...base, lastAutoBackupAt: NOW + 30 * DAY })).toBe(true)
  })
})

describe('nextAutoBackupAt', () => {
  it('is null when off, now when never run, and a week after the last run', () => {
    expect(nextAutoBackupAt({ enabled: false, lastAutoBackupAt: null, now: NOW })).toBeNull()
    expect(nextAutoBackupAt({ enabled: true, lastAutoBackupAt: null, now: NOW })).toBe(NOW)
    expect(nextAutoBackupAt({ enabled: true, lastAutoBackupAt: NOW - DAY, now: NOW })).toBe(
      NOW - DAY + AUTO_BACKUP_INTERVAL_DAYS * DAY,
    )
  })
})
