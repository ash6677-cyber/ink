/**
 * The story timeline.
 *
 * Reading order and story order are not the same thing — a flashback in
 * chapter nine happens before chapter one, and a writer juggling three
 * threads across a fortnight can lose track of which day it is. Give a scene
 * an optional story-day and this arranges the book on a when-it-happens axis,
 * so "the funeral is somehow before the death" becomes visible.
 *
 * Pure arithmetic over scenes with an optional day. No DOM.
 */

export interface TimelineScene {
  id: string
  title: string
  chapterTitle: string
  storyDay: number | null
  /** Reading position, to order scenes that share a day. */
  order: number
}

export interface TimelineDay {
  day: number
  scenes: TimelineScene[]
}

export interface Timeline {
  /** Dated scenes grouped by story-day, ascending. */
  days: TimelineDay[]
  /** Scenes with no story-day yet, in reading order. */
  undated: TimelineScene[]
  /** True when a later reading-order scene has an earlier story-day than an
   * earlier one — the "out of order in time" signal worth surfacing. */
  hasReversal: boolean
}

/** Groups scenes by story-day and flags reading-vs-story-order reversals. */
export function buildTimeline(scenes: TimelineScene[]): Timeline {
  const dated = scenes.filter((s) => s.storyDay !== null && s.storyDay !== undefined)
  const undated = scenes
    .filter((s) => s.storyDay === null || s.storyDay === undefined)
    .sort((a, b) => a.order - b.order)

  const byDay = new Map<number, TimelineScene[]>()
  for (const scene of dated) {
    const day = scene.storyDay as number
    const list = byDay.get(day) ?? []
    list.push(scene)
    byDay.set(day, list)
  }

  const days: TimelineDay[] = [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, list]) => ({ day, scenes: [...list].sort((a, b) => a.order - b.order) }))

  // A reversal: walk the dated scenes in READING order; if the story-day ever
  // drops below the highest seen so far, reading and story order disagree.
  let highest = -Infinity
  let hasReversal = false
  for (const scene of [...dated].sort((a, b) => a.order - b.order)) {
    const day = scene.storyDay as number
    if (day < highest) {
      hasReversal = true
      break
    }
    highest = Math.max(highest, day)
  }

  return { days, undated, hasReversal }
}

/** A short human label for a story-day: "Day 3", "Day −30" for a flashback. */
export function dayLabel(day: number): string {
  return day < 0 ? `Day −${Math.abs(day)}` : `Day ${day}`
}
