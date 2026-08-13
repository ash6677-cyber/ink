/**
 * One search box over everything: the palette already jumps by NAME; this
 * searches the CONTENT — Almanac bodies and attributes, character sheets,
 * chat transcripts, promises, submissions — ranked, with enough snippet
 * to recognise the memory before jumping to it. The whole library as one
 * searchable memory.
 *
 * Scope stays the open project, same honest rule as prose search: those
 * records are already in memory (or one cheap table away); pretending to
 * search books that aren't loaded would mean lying about latency.
 */

export type LibraryDocKind =
  | 'almanac'
  | 'character'
  | 'chat'
  | 'promise'
  | 'submission'
  | 'map'

export interface LibraryDoc {
  id: string
  kind: LibraryDocKind
  /** What the result is called. */
  title: string
  /** Everything searchable that isn't the title. */
  body: string
  /** A short trailing label — a chapter, a status, a market. */
  hint?: string
}

export interface LibraryMatch {
  doc: LibraryDoc
  score: number
  /** Context around the first body hit, or the title when it carried the match. */
  snippet: string
}

export const MIN_LIBRARY_QUERY = 3

const CONTEXT_CHARS = 36

function snippetAround(text: string, from: number, to: number): string {
  let start = Math.max(0, from - CONTEXT_CHARS)
  let end = Math.min(text.length, to + CONTEXT_CHARS)
  while (start > 0 && !/\s/.test(text[start - 1])) start--
  while (end < text.length && !/\s/.test(text[end])) end++
  const core = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${core}${end < text.length ? '…' : ''}`
}

function wordBoundaryIndex(haystack: string, needle: string): number {
  const pattern = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
  const match = pattern.exec(haystack)
  return match ? match.index : -1
}

/**
 * Every-term-must-appear search, scored: a term on the title outweighs one
 * buried in the body, and a whole-word hit outweighs a substring. Results
 * come back best-first, ties broken by title for stability.
 */
export function searchLibrary(docs: LibraryDoc[], query: string, limit = 8): LibraryMatch[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0 || query.trim().length < MIN_LIBRARY_QUERY) return []

  const matches: LibraryMatch[] = []
  for (const doc of docs) {
    const title = doc.title.toLowerCase()
    const body = doc.body.toLowerCase()
    let score = 0
    let firstBodyHit = -1
    let firstBodyLength = 0
    let allFound = true

    for (const term of terms) {
      const titleWord = wordBoundaryIndex(doc.title, term)
      const bodyWord = wordBoundaryIndex(doc.body, term)
      if (titleWord !== -1) score += 3
      else if (title.includes(term)) score += 2
      else if (bodyWord !== -1) score += 1.5
      else if (body.includes(term)) score += 1
      else {
        allFound = false
        break
      }
      const hit = bodyWord !== -1 ? bodyWord : body.indexOf(term)
      if (hit !== -1 && (firstBodyHit === -1 || hit < firstBodyHit)) {
        firstBodyHit = hit
        firstBodyLength = term.length
      }
    }
    if (!allFound || score === 0) continue

    matches.push({
      doc,
      score,
      snippet:
        firstBodyHit !== -1
          ? snippetAround(doc.body, firstBodyHit, firstBodyHit + firstBodyLength)
          : doc.title,
    })
  }

  return matches
    .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title))
    .slice(0, limit)
}
