/**
 * Dictation's grammar: what the writer says becomes what the page shows.
 *
 * Speech engines hand over a flat stream of words — "the river said comma
 * we go now period new paragraph" — and this turns the spoken commands
 * into their marks, fixes the spacing around them, and capitalizes
 * sentence openings, exactly the way walking-writers and RSI-writers
 * expect a dictation surface to behave. Pure text; the microphone and
 * the editor live elsewhere.
 */

type Mark =
  | { kind: 'punct'; char: string }
  | { kind: 'break'; text: string }
  | { kind: 'open-quote' }
  | { kind: 'close-quote' }
  | { kind: 'word'; text: string }

/** Longest phrases first, so "exclamation mark" wins over any one word. */
const COMMAND_TABLE: [string, Mark][] = [
  ['exclamation mark', { kind: 'punct', char: '!' }],
  ['exclamation point', { kind: 'punct', char: '!' }],
  ['question mark', { kind: 'punct', char: '?' }],
  ['full stop', { kind: 'punct', char: '.' }],
  ['new paragraph', { kind: 'break', text: '\n\n' }],
  ['new line', { kind: 'break', text: '\n' }],
  ['open quote', { kind: 'open-quote' }],
  ['close quote', { kind: 'close-quote' }],
  ['period', { kind: 'punct', char: '.' }],
  ['comma', { kind: 'punct', char: ',' }],
  ['semicolon', { kind: 'punct', char: ';' }],
  ['colon', { kind: 'punct', char: ':' }],
  ['ellipsis', { kind: 'punct', char: '…' }],
  ['dash', { kind: 'word', text: '—' }],
]

const COMMANDS: [string, Mark][] = [...COMMAND_TABLE].sort(
  (a, b) => b[0].split(' ').length - a[0].split(' ').length,
)

/** Turns a spoken transcript into typed prose: commands become marks,
 * spacing heals around them, and sentences open with a capital. */
export function applySpokenCommands(transcript: string): string {
  const words = transcript.split(/\s+/).filter(Boolean)
  let out = ''

  const append = (word: string) => {
    const needsSpace = out !== '' && !out.endsWith('\n') && !out.endsWith('“')
    out += (needsSpace ? ' ' : '') + word
  }

  let i = 0
  while (i < words.length) {
    let matched: Mark | null = null
    let consumed = 0
    for (const [phrase, mark] of COMMANDS) {
      const parts = phrase.split(' ')
      const candidate = words.slice(i, i + parts.length).join(' ').toLowerCase()
      if (candidate === phrase) {
        matched = mark
        consumed = parts.length
        break
      }
    }

    if (!matched) {
      append(words[i])
      i += 1
      continue
    }

    i += consumed
    switch (matched.kind) {
      case 'punct':
        out = out.replace(/[ \t]+$/, '') + matched.char
        break
      case 'break':
        out = out.replace(/[ \t]+$/, '') + matched.text
        break
      case 'open-quote':
        append('“')
        break
      case 'close-quote':
        out = out.replace(/[ \t]+$/, '') + '”'
        break
      case 'word':
        append(matched.text)
        break
    }
  }

  return capitalizeSentences(out)
}

/** The first letter, and every letter opening a sentence or paragraph. */
function capitalizeSentences(text: string): string {
  return text.replace(
    /(^|[.!?…]\s+|\n\s*)([“”]?)([a-z])/g,
    (_, before: string, quote: string, letter: string) => before + quote + letter.toUpperCase(),
  )
}

/** What the punctuation help sheet shows, derived from the real table so
 * the docs can never drift from the behavior. */
export function spokenCommandHelp(): { say: string; get: string }[] {
  return COMMANDS.map(([phrase, mark]) => ({
    say: phrase,
    get:
      mark.kind === 'punct'
        ? mark.char
        : mark.kind === 'break'
          ? mark.text === '\n\n'
            ? '¶ new paragraph'
            : '↵ new line'
          : mark.kind === 'word'
            ? mark.text
            : mark.kind === 'open-quote'
              ? '“'
              : '”',
  }))
}
