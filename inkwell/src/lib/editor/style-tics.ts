/**
 * Style tics: the writer's own list of words to watch for.
 *
 * Every writer has them — "just", "suddenly", "very", a pet simile — the
 * crutches the eye stops seeing. This isn't grammar and it isn't the AI's
 * opinion; it's a private watchlist the writer curates, counted honestly
 * and highlighted so the habit becomes visible. Nothing is ever changed
 * automatically: seeing "suddenly" 34 times is the whole feature.
 *
 * Pure text logic, no editor and no DOM, so the counting and the
 * word-boundary rules stay under unit test.
 */

export interface TicCount {
  word: string
  count: number
}

/** Normalises the raw watchlist: trimmed, de-duplicated, lower-cased,
 * blanks dropped. Order is preserved so the writer's list reads back the
 * way they typed it. */
export function normaliseTics(raw: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of raw) {
    const word = entry.trim().toLowerCase()
    if (!word || seen.has(word)) continue
    seen.add(word)
    out.push(word)
  }
  return out
}

/** Parses a comma-or-newline separated watchlist from a text field. */
export function parseTicList(text: string): string[] {
  return normaliseTics(text.split(/[\n,]/))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A single case-insensitive, global regex matching any watchlist word on
 * whole-word boundaries — so "just" never lights up inside "adjust", but a
 * multi-word tic like "all of a sudden" still matches. Null when the list
 * is empty, which every caller treats as "nothing to look for".
 */
export function buildTicRegex(tics: string[]): RegExp | null {
  const words = normaliseTics(tics)
  if (words.length === 0) return null
  // Longest first, so "all of a sudden" wins over a bare "sudden".
  const alternation = [...words]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|')
  return new RegExp(`\\b(?:${alternation})\\b`, 'gi')
}

/**
 * How often each watchlist word appears in the text, watchlist order,
 * zero-count words included so the writer sees the whole list scored.
 */
export function countTics(plainText: string, tics: string[]): TicCount[] {
  const words = normaliseTics(tics)
  if (words.length === 0) return []
  const counts = new Map<string, number>(words.map((w) => [w, 0]))

  const regex = buildTicRegex(words)
  if (regex) {
    let match: RegExpExecArray | null
    while ((match = regex.exec(plainText))) {
      const hit = match[0].toLowerCase()
      counts.set(hit, (counts.get(hit) ?? 0) + 1)
      if (match[0].length === 0) regex.lastIndex++
    }
  }
  return words.map((word) => ({ word, count: counts.get(word) ?? 0 }))
}

/** Total watchlist hits across the text — the number for a badge. */
export function totalTicHits(plainText: string, tics: string[]): number {
  return countTics(plainText, tics).reduce((sum, t) => sum + t.count, 0)
}
