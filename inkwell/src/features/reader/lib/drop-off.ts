/**
 * Where readers stop.
 *
 * The pulse holds two kinds of anonymous pings: an open (`{at}`) per
 * visit, and a reach (`{at, chapter}`) the first time a device gets to
 * each chapter. Counting reaches per chapter gives the one curve every
 * writer with beta readers wants and nobody has to write a comment to
 * produce: how many made it to each chapter, and where they quietly
 * stopped. Pure counting; the dialog just draws bars.
 */

export interface PulsePing {
  at: number
  /** Null for an open ping; a chapter index for a reach ping. */
  chapter: number | null
}

export interface DropOff {
  opens: number
  lastOpenedAt: number | null
  /** Devices counted at each chapter index, story order. */
  reached: number[]
  /** Devices that reached the final chapter — the honest "finished". */
  finished: number
  /** Whether any reach pings exist at all (old shares have only opens). */
  hasCurve: boolean
}

export function dropOffCurve(pings: PulsePing[], chapterCount: number): DropOff {
  const reached = Array.from({ length: Math.max(0, chapterCount) }, () => 0)
  let opens = 0
  let lastOpenedAt = 0
  let hasCurve = false

  for (const ping of pings) {
    if (ping.chapter === null) {
      opens += 1
      if (ping.at > lastOpenedAt) lastOpenedAt = ping.at
      continue
    }
    hasCurve = true
    const chapter = Math.floor(ping.chapter)
    if (chapter >= 0 && chapter < reached.length) reached[chapter] += 1
  }

  return {
    opens,
    lastOpenedAt: lastOpenedAt > 0 ? lastOpenedAt : null,
    reached,
    finished: reached.length > 0 ? reached[reached.length - 1] : 0,
    hasCurve,
  }
}

/** The one-line story of the curve: "8 opened · 6 reached Chapter 4 · 2 finished". */
export function dropOffSummary(curve: DropOff, chapterTitle: (index: number) => string): string {
  const parts = [`${curve.opens} ${curve.opens === 1 ? 'open' : 'opens'}`]
  if (curve.hasCurve) {
    // The deepest chapter that still holds more than the finisher count —
    // the last place the crowd was, before the drop.
    let deepest = -1
    for (let i = curve.reached.length - 1; i >= 0; i--) {
      if (curve.reached[i] > 0) {
        deepest = i
        break
      }
    }
    if (deepest >= 0 && deepest < curve.reached.length - 1) {
      parts.push(`read as far as ${chapterTitle(deepest)}`)
    }
    parts.push(`${curve.finished} finished`)
  }
  return parts.join(' · ')
}
