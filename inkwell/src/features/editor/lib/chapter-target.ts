/**
 * Per-chapter word targets.
 *
 * The book-level goal says how big the whole thing should be; it says
 * nothing about the chapter you're actually inside today. A chapter target
 * turns "80,000 words eventually" into "1,200 more words in this chapter" —
 * a number small enough to finish before dinner. Pure arithmetic; the ring
 * in the chapter list is drawn from what this returns.
 */

export interface ChapterProgress {
  /** Completion 0..1, clamped — a finished chapter never overflows the ring. */
  fraction: number
  /** Whole-number percent of the raw (unclamped) completion. */
  percent: number
  /** Words still to write; 0 once the target is met. */
  remaining: number
  /** True once the count meets or passes the target. */
  met: boolean
}

/**
 * Progress toward a chapter target, or null when there's no usable target
 * (unset, zero, negative, or not a finite number).
 */
export function chapterProgress(
  wordCount: number,
  target: number | null | undefined,
): ChapterProgress | null {
  if (target === null || target === undefined) return null
  if (!Number.isFinite(target) || target <= 0) return null
  const words = Math.max(0, wordCount)
  const raw = words / target
  return {
    fraction: Math.min(1, raw),
    percent: Math.round(raw * 100),
    remaining: Math.max(0, Math.ceil(target - words)),
    met: words >= target,
  }
}

/**
 * Stroke geometry for an SVG progress ring of the given radius:
 * the circumference and how much of it to paint for `fraction`.
 */
export function ringStroke(fraction: number, radius: number): { circumference: number; dash: number } {
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(1, Math.max(0, fraction))
  return { circumference, dash: circumference * clamped }
}

/**
 * Parse the target as typed into a form field: blank clears the target,
 * anything unparsable or non-positive is rejected as null too (never store
 * a NaN or a 0-word target), and fractions are truncated to whole words.
 */
export function parseTargetInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const parsed = Math.trunc(Number(trimmed))
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}
