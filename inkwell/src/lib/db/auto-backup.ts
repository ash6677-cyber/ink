/**
 * The weekly backup ritual.
 *
 * The nudge asks; the ritual just does it. Once a writer opts in, the app
 * saves a full library backup once a week on its own — a downloaded
 * `.inkwell` file in the browser, a silent snapshot into the backups
 * folder in the desktop app — and stays quiet the rest of the time.
 *
 * Pure arithmetic here; the runner component owns the clock and the
 * download.
 */

export const AUTO_BACKUP_INTERVAL_DAYS = 7

/** Words below this aren't worth a weekly file of their own yet. */
export const AUTO_BACKUP_MIN_WORDS = 250

export interface AutoBackupState {
  enabled: boolean
  /** When the ritual last ran, or null if it never has. */
  lastAutoBackupAt: number | null
  now: number
  /** Words in the whole library, to skip empty ones. */
  words: number
}

/** True when the weekly backup should run right now. */
export function autoBackupDue({ enabled, lastAutoBackupAt, now, words }: AutoBackupState): boolean {
  if (!enabled) return false
  if (words < AUTO_BACKUP_MIN_WORDS) return false
  if (lastAutoBackupAt === null) return true
  // Clock skew (a restored device, a timezone hop) must never wedge the
  // ritual: a "last run" in the future counts as due, not as never-again.
  if (lastAutoBackupAt > now) return true
  return now - lastAutoBackupAt >= AUTO_BACKUP_INTERVAL_DAYS * 86_400_000
}

/** When the next run falls, for the Settings blurb. Null when off. */
export function nextAutoBackupAt(state: Omit<AutoBackupState, 'words'>): number | null {
  if (!state.enabled) return null
  if (state.lastAutoBackupAt === null || state.lastAutoBackupAt > state.now) return state.now
  return state.lastAutoBackupAt + AUTO_BACKUP_INTERVAL_DAYS * 86_400_000
}
