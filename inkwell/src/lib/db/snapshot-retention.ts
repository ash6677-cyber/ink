import type { Snapshot } from '@/types'

import { isBaselineSnapshot } from '@/features/editor/lib/revision'
import { isConflictSnapshot } from '@/lib/sync/conflict'

/**
 * How much of a scene's history is worth keeping.
 *
 * A snapshot every five minutes for a year is a quarter of a million versions
 * of one scene, and a writer who has been at a book that long is exactly the
 * writer whose device is running out of room. But history is also the thing
 * they would most hate to lose, so this thins rather than truncates: recent
 * work stays minute by minute, the last few months stay day by day, and
 * everything older keeps one version a week.
 *
 * Two things are never swept. The newest snapshot of a scene, because a scene
 * with no history at all is a worse outcome than a large one. And anything
 * saved because a sync was about to overwrite it — those exist precisely
 * because they were nearly lost once already.
 */

export const DAY_MS = 24 * 60 * 60 * 1000

export interface RetentionPolicy {
  /** Days during which every snapshot is kept. */
  keepAllDays: number
  /** Days during which one per day is kept. */
  keepDailyDays: number
}

export const DEFAULT_RETENTION: RetentionPolicy = { keepAllDays: 7, keepDailyDays: 90 }

/** Which calendar day, or week, a moment falls in — the bucket key. */
function bucketFor(createdAt: number, now: number, policy: RetentionPolicy): string | null {
  const age = now - createdAt
  if (age <= policy.keepAllDays * DAY_MS) return null // every one is kept
  const days = Math.floor(createdAt / DAY_MS)
  if (age <= policy.keepDailyDays * DAY_MS) return `d${days}`
  return `w${Math.floor(days / 7)}`
}

/**
 * The snapshots to remove, given everything a scene has.
 *
 * Pure, and takes `now`, so the policy can be tested at any age without
 * waiting three months for the answer.
 */
export function snapshotsToSweep(
  snapshots: Snapshot[],
  now: number,
  policy: RetentionPolicy = DEFAULT_RETENTION,
): string[] {
  const bySceneId = new Map<string, Snapshot[]>()
  for (const snapshot of snapshots) {
    const list = bySceneId.get(snapshot.sceneId)
    if (list) list.push(snapshot)
    else bySceneId.set(snapshot.sceneId, [snapshot])
  }

  const doomed: string[] = []
  for (const scene of bySceneId.values()) {
    // Newest first, so the survivor of each bucket is the latest in it —
    // the version the writer actually ended that day or week with.
    const ordered = [...scene].sort((a, b) => b.createdAt - a.createdAt)
    const keptBuckets = new Set<string>()

    for (const [index, snapshot] of ordered.entries()) {
      if (isConflictSnapshot(snapshot)) continue // nearly lost once already
      if (isBaselineSnapshot(snapshot)) continue // a frozen draft is forever
      const bucket = bucketFor(snapshot.createdAt, now, policy)
      if (bucket === null) continue // inside the keep-everything window

      // The newest is never swept, but it does claim its bucket. Skipping it
      // outright would leave a second survivor in the same day or week, so
      // every scene quietly kept one more version than the policy says.
      if (index === 0) {
        keptBuckets.add(bucket)
        continue
      }
      if (keptBuckets.has(bucket)) doomed.push(snapshot.id)
      else keptBuckets.add(bucket)
    }
  }
  return doomed
}

/** A plain-language summary, for the setting that turns this on. */
export function describeRetention(policy: RetentionPolicy = DEFAULT_RETENTION): string {
  return (
    `Every version from the last ${policy.keepAllDays} days, ` +
    `one a day for ${policy.keepDailyDays}, then one a week. ` +
    'The newest version of a scene and anything kept from a sync conflict are never removed.'
  )
}
