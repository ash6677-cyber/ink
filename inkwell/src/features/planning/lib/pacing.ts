/**
 * Pacing, measured rather than felt.
 *
 * Nothing here reads meaning — it reads tempo, from three honest numbers
 * per scene: how long it is, how much of it is spoken aloud, and how long
 * its sentences run. Short or talkative scenes read brisk; long, quiet,
 * long-sentenced ones read slow. None of that is a judgement — a slow
 * scene is often the point — but three slow scenes in a row is something
 * a writer wants to have chosen, and this is the strip that shows it.
 *
 * Pure arithmetic. No AI, no DOM.
 */

export interface SceneTempo {
  sceneId: string
  title: string
  chapterTitle: string
  words: number
  /** 0..1 — the share of words spoken inside quotation marks. */
  dialogueRatio: number
  /** Mean sentence length in words. */
  avgSentenceLength: number
  tempo: 'brisk' | 'measured' | 'slow'
}

export interface SlowStretch {
  /** Indexes into the tempo array, inclusive. */
  from: number
  to: number
  sceneTitles: string[]
  words: number
}

export interface BookPacing {
  scenes: SceneTempo[]
  stretches: SlowStretch[]
  /** Median scene length, the yardstick the strip is scaled against. */
  medianWords: number
}

/** Words inside straight or curly double quotes — the spoken share. */
export function dialogueWords(text: string): number {
  let count = 0
  const patterns = [/"([^"]*)"/g, /“([^“”]*)”/g]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      count += match[1].split(/\s+/).filter(Boolean).length
    }
  }
  return count
}

export function sentenceLengths(text: string): number[] {
  return text
    .split(/[.!?]+(?:\s+|$)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(/\s+/).filter(Boolean).length)
}

const SLOW_WORDS = 1600
const BRISK_WORDS = 700
const TALKATIVE = 0.35
const QUIET = 0.12
const LONG_SENTENCES = 22

export function sceneTempo(input: {
  sceneId: string
  title: string
  chapterTitle: string
  plainText: string
}): SceneTempo {
  const words = input.plainText.split(/\s+/).filter(Boolean).length
  const spoken = dialogueWords(input.plainText)
  const dialogueRatio = words === 0 ? 0 : Math.min(1, spoken / words)
  const lengths = sentenceLengths(input.plainText)
  const avgSentenceLength =
    lengths.length === 0 ? 0 : lengths.reduce((a, b) => a + b, 0) / lengths.length

  let tempo: SceneTempo['tempo'] = 'measured'
  if (words <= BRISK_WORDS || dialogueRatio >= TALKATIVE) tempo = 'brisk'
  // Slow outranks brisk-by-dialogue only when the scene is genuinely heavy:
  // long, quiet, and long-sentenced is the unambiguous case.
  if (words >= SLOW_WORDS && dialogueRatio <= QUIET) tempo = 'slow'
  else if (words >= SLOW_WORDS && avgSentenceLength >= LONG_SENTENCES) tempo = 'slow'

  return {
    sceneId: input.sceneId,
    title: input.title,
    chapterTitle: input.chapterTitle,
    words,
    dialogueRatio,
    avgSentenceLength,
    tempo,
  }
}

/** The whole book's tempo, with runs of three or more slow scenes named. */
export function bookPacing(
  scenes: { sceneId: string; title: string; chapterTitle: string; plainText: string }[],
): BookPacing {
  const tempos = scenes.map(sceneTempo)

  const stretches: SlowStretch[] = []
  let runStart = -1
  const closeRun = (end: number) => {
    if (runStart === -1) return
    const length = end - runStart + 1
    if (length >= 3) {
      const slice = tempos.slice(runStart, end + 1)
      stretches.push({
        from: runStart,
        to: end,
        sceneTitles: slice.map((t) => t.title),
        words: slice.reduce((sum, t) => sum + t.words, 0),
      })
    }
    runStart = -1
  }
  tempos.forEach((t, i) => {
    if (t.tempo === 'slow') {
      if (runStart === -1) runStart = i
    } else {
      closeRun(i - 1)
    }
  })
  closeRun(tempos.length - 1)

  const sorted = tempos.map((t) => t.words).sort((a, b) => a - b)
  const medianWords =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)

  return { scenes: tempos, stretches, medianWords }
}
