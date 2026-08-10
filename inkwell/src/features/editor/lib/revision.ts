/**
 * Revision passes — the second draft as a first-class thing.
 *
 * Freezing a draft pins every scene as it stood, under a named baseline
 * ("Draft 1"). From then on the manuscript can answer questions drafting
 * mode never could: which scenes have actually been revised, which are
 * untouched, which are new since the freeze, and what the revision has
 * done to the book's size. The baselines live as ordinary snapshots with
 * a recognisable label, so each scene's History shows its frozen self and
 * the existing diff view becomes the ghost view for free.
 *
 * Pure arithmetic over scenes and their baselines. No storage in sight.
 */

import type { Scene, Snapshot } from '@/types'

/** Baseline snapshots carry this prefix; retention never sweeps them. */
export const BASELINE_PREFIX = 'Baseline — '

export function baselineLabel(passName: string): string {
  return `${BASELINE_PREFIX}${passName.trim() || 'Draft'}`
}

export function isBaselineSnapshot(snapshot: Pick<Snapshot, 'label'>): boolean {
  return snapshot.label.startsWith(BASELINE_PREFIX)
}

export type SceneRevisionStatus = 'untouched' | 'revised' | 'new'

export interface SceneRevision {
  sceneId: string
  title: string
  status: SceneRevisionStatus
  /** Words now minus words at the freeze (0 for new scenes' baseline). */
  wordDelta: number
}

export interface DraftReport {
  scenes: SceneRevision[]
  revised: number
  untouched: number
  added: number
  /** Baseline scenes that no longer exist — cut whole. */
  removed: number
  /** Net words across surviving scenes plus additions, minus removals. */
  netWords: number
  wordsAtFreeze: number
  wordsNow: number
  /** 0..1 of pre-existing scenes that have been touched. */
  progress: number
}

export interface BaselineEntry {
  sceneId: string
  plainText: string
  wordCount: number
}

/**
 * The state of the revision: every current scene judged against its
 * baseline, and the baseline's ghosts counted where scenes were cut.
 * Judged by content, not by timestamps — reopening a scene without
 * changing a word is not a revision.
 */
export function draftReport(
  scenes: Pick<Scene, 'id' | 'title' | 'plainText' | 'wordCount'>[],
  baselines: BaselineEntry[],
): DraftReport {
  const baselineById = new Map(baselines.map((b) => [b.sceneId, b]))
  const sceneIds = new Set(scenes.map((s) => s.id))

  const out: SceneRevision[] = []
  let revised = 0
  let untouched = 0
  let added = 0

  for (const scene of scenes) {
    const baseline = baselineById.get(scene.id)
    if (!baseline) {
      added += 1
      out.push({ sceneId: scene.id, title: scene.title, status: 'new', wordDelta: scene.wordCount })
      continue
    }
    const changed = scene.plainText !== baseline.plainText
    if (changed) revised += 1
    else untouched += 1
    out.push({
      sceneId: scene.id,
      title: scene.title,
      status: changed ? 'revised' : 'untouched',
      wordDelta: scene.wordCount - baseline.wordCount,
    })
  }

  const removedEntries = baselines.filter((b) => !sceneIds.has(b.sceneId))
  const wordsAtFreeze = baselines.reduce((sum, b) => sum + b.wordCount, 0)
  const wordsNow = scenes.reduce((sum, s) => sum + s.wordCount, 0)
  const preExisting = revised + untouched

  return {
    scenes: out,
    revised,
    untouched,
    added,
    removed: removedEntries.length,
    netWords: wordsNow - wordsAtFreeze,
    wordsAtFreeze,
    wordsNow,
    progress: preExisting === 0 ? 0 : revised / preExisting,
  }
}

/** "Draft 3" when two passes exist already — the name a freeze suggests. */
export function nextDraftName(existingCount: number): string {
  return `Draft ${existingCount + 1}`
}
