/**
 * Full-text search over scene prose, for the command palette.
 *
 * A writer looking for "the salt road" doesn't remember which scene it's in —
 * that is the entire point of asking. So the palette searches the words
 * themselves, not just the titles, and shows enough surrounding text to
 * recognise the passage before committing to the jump.
 *
 * Scope is deliberately the book currently open in the editor: those scenes
 * are already in memory with their plain text, so the search costs nothing to
 * run on every keystroke. Cross-project search would mean loading every book
 * off disk mid-keypress; until an index exists, refusing to pretend is the
 * honest option.
 */

export interface ProseSearchScene {
  id: string
  title: string
  plainText: string
}

export interface ProseMatch {
  sceneId: string
  sceneTitle: string
  /** The matched text with its surroundings, ellipsised at cut edges. */
  snippet: string
}

/** Queries shorter than this hit almost every scene and help nobody. */
export const MIN_PROSE_QUERY = 3

const CONTEXT_CHARS = 32

/** Widens [from, to) to whole words and decorates cut edges with ellipses. */
function snippetAround(text: string, from: number, to: number): string {
  let start = Math.max(0, from - CONTEXT_CHARS)
  let end = Math.min(text.length, to + CONTEXT_CHARS)

  // Step outward to the nearest word boundary so the snippet never opens or
  // closes mid-word — "…he salt roa…" reads like a glitch, not a preview.
  while (start > 0 && !/\s/.test(text[start - 1])) start--
  while (end < text.length && !/\s/.test(text[end])) end++

  const core = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${core}${end < text.length ? '…' : ''}`
}

/**
 * The scenes whose prose contains the query, in manuscript order, one match
 * per scene — the palette is a jump list, not a concordance.
 */
export function searchProse(
  scenes: ProseSearchScene[],
  query: string,
  limit = 6,
): ProseMatch[] {
  const needle = query.trim().toLowerCase()
  if (needle.length < MIN_PROSE_QUERY) return []

  const matches: ProseMatch[] = []
  for (const scene of scenes) {
    const index = scene.plainText.toLowerCase().indexOf(needle)
    if (index === -1) continue
    matches.push({
      sceneId: scene.id,
      sceneTitle: scene.title,
      snippet: snippetAround(scene.plainText, index, index + needle.length),
    })
    if (matches.length >= limit) break
  }
  return matches
}
