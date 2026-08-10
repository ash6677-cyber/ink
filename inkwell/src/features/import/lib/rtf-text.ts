/**
 * RTF, reduced to its words.
 *
 * Scrivener stores every document as RTF. We need none of the formatting —
 * the editor re-dresses the prose in its own clothes — but we need every
 * word, which means walking the format properly: groups nest, destinations
 * (font tables, image data) must be skipped whole, and the text hides
 * behind three kinds of escape. A tolerant hand-rolled scanner, pure and
 * testable, beats a dependency here.
 */

/** Control words whose whole group is metadata, never prose. */
const SKIP_DESTINATIONS = new Set([
  'fonttbl',
  'colortbl',
  'stylesheet',
  'info',
  'pict',
  'themedata',
  'listtable',
  'listoverridetable',
  'generator',
  'header',
  'footer',
  'xmlnstbl',
  'filetbl',
  'revtbl',
])

const CONTROL_TEXT: Record<string, string> = {
  emdash: '—',
  endash: '–',
  lquote: '‘',
  rquote: '’',
  ldblquote: '“',
  rdblquote: '”',
  bullet: '•',
  tab: ' ',
  line: ' ',
  enspace: ' ',
  emspace: ' ',
  '~': ' ',
}

export function rtfToParagraphs(rtf: string): string[] {
  const paragraphs: string[] = []
  let current = ''
  const flush = () => {
    const text = current.replace(/\s+/g, ' ').trim()
    if (text) paragraphs.push(text)
    current = ''
  }

  // Each group remembers how many fallback characters follow a \uN escape
  // (the \uc convention) and whether the whole group is being skipped.
  interface GroupState {
    uc: number
    skip: boolean
  }
  const stack: GroupState[] = [{ uc: 1, skip: false }]
  const state = () => stack[stack.length - 1]

  let i = 0
  let pendingUnicodeSkip = 0
  const n = rtf.length

  while (i < n) {
    const ch = rtf[i]

    if (ch === '{') {
      stack.push({ ...state() })
      i++
      continue
    }
    if (ch === '}') {
      if (stack.length > 1) stack.pop()
      i++
      continue
    }
    if (ch === '\\') {
      const next = rtf[i + 1]
      // Escaped literals.
      if (next === '\\' || next === '{' || next === '}') {
        if (!state().skip) current += next
        i += 2
        continue
      }
      // \'hh — a byte in the document codepage; Latin-1 is close enough
      // for the Western text Scrivener writes by default.
      if (next === "'") {
        const hex = rtf.slice(i + 2, i + 4)
        if (!state().skip) {
          if (pendingUnicodeSkip > 0) pendingUnicodeSkip--
          else current += String.fromCharCode(Number.parseInt(hex, 16) || 63)
        }
        i += 4
        continue
      }
      // \* — the group is an optional destination; skip it whole.
      if (next === '*') {
        state().skip = true
        i += 2
        continue
      }
      if (next === '~') {
        if (!state().skip) current += ' '
        i += 2
        continue
      }
      // A control word: letters, optional signed number, optional one space.
      const match = /^\\([a-z]+)(-?\d+)? ?/i.exec(rtf.slice(i))
      if (match) {
        const word = match[1]
        const param = match[2] ? Number.parseInt(match[2], 10) : null
        i += match[0].length

        if (SKIP_DESTINATIONS.has(word)) {
          state().skip = true
          continue
        }
        if (state().skip) continue

        if (word === 'par' || word === 'sect' || word === 'page') {
          flush()
        } else if (word === 'uc') {
          state().uc = param ?? 1
        } else if (word === 'u' && param !== null) {
          // RTF writes negative values for code points above 0x7FFF.
          const code = param < 0 ? param + 65536 : param
          current += String.fromCharCode(code)
          pendingUnicodeSkip = state().uc
        } else if (word === 'bin' && param !== null && param > 0) {
          i += param // raw bytes follow; never text
        } else if (word in CONTROL_TEXT) {
          current += CONTROL_TEXT[word]
        }
        continue
      }
      // A lone backslash before something unexpected: drop it.
      i++
      continue
    }

    // Plain text. Raw newlines in RTF are not paragraph breaks.
    if (ch !== '\n' && ch !== '\r') {
      if (!state().skip) {
        if (pendingUnicodeSkip > 0) pendingUnicodeSkip--
        else current += ch
      }
    }
    i++
  }
  flush()
  return paragraphs
}
