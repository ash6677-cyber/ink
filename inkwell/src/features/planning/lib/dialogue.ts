/**
 * The dialogue pass: every spoken line lifted out of the prose into one
 * continuous read — the fastest way to hear a voice wobble — with honest,
 * naive attribution. A line is credited to a speaker only when a dialogue
 * tag right beside it names one ("...," said Marta / Marta said, "...");
 * anything else stays unattributed rather than guessed at.
 *
 * Pure text arithmetic. The optional AI voice check builds its messages
 * here too, but calling a model is the caller's business.
 */

export interface DialogueLine {
  sceneId: string
  sceneTitle: string
  chapterTitle: string
  quote: string
  /** The tagged speaker, or null when no adjacent tag names one. */
  speaker: string | null
}

export interface VoiceStats {
  /** The speaker's name, or null for the unattributed remainder. */
  speaker: string | null
  lines: number
  words: number
  /** 0..1 — this voice's share of all dialogue words. */
  share: number
  avgLineWords: number
  /** The voice's pet words — frequent, content-bearing, at least twice. */
  favourites: string[]
}

const SPEECH_VERBS =
  'said|asked|replied|whispered|shouted|muttered|answered|called|snapped|murmured|added|agreed|breathed|cried|demanded|groaned|growled|hissed|insisted|laughed|offered|pleaded|promised|protested|repeated|sighed|sobbed|warned|wondered|yelled|began|continued|echoed|admitted'

/** Words that look like names but are just grammar. */
const NOT_NAMES = new Set([
  'She', 'He', 'They', 'I', 'We', 'It', 'You', 'Then', 'But', 'And', 'The', 'A', 'An',
])

const NAME = "([A-Z][A-Za-z'’-]+)"

// "…," said Marta   /   "…," Marta said
const AFTER_VERB_NAME = new RegExp(`^[\\s,.!?—–-]*(?:${SPEECH_VERBS})\\s+${NAME}`)
const AFTER_NAME_VERB = new RegExp(`^[\\s,.!?—–-]*${NAME}\\s+(?:${SPEECH_VERBS})\\b`)
// Marta said, "…"   /   said Marta: "…"  (looking backwards from the quote)
const BEFORE_NAME_VERB = new RegExp(`${NAME}\\s+(?:${SPEECH_VERBS})[^.!?"“”]{0,40}$`)
const BEFORE_VERB_NAME = new RegExp(`(?:${SPEECH_VERBS})\\s+${NAME}[^.!?"“”]{0,40}$`)

function asName(candidate: string | undefined): string | null {
  if (!candidate || NOT_NAMES.has(candidate)) return null
  return candidate
}

/** The tagged speaker for one quote, judged from the text around it. */
export function attributeQuote(before: string, after: string): string | null {
  const afterMatch = AFTER_VERB_NAME.exec(after) ?? AFTER_NAME_VERB.exec(after)
  const fromAfter = asName(afterMatch?.[1])
  if (fromAfter) return fromAfter
  const beforeMatch = BEFORE_NAME_VERB.exec(before) ?? BEFORE_VERB_NAME.exec(before)
  return asName(beforeMatch?.[1])
}

/** Every quoted span in reading order, with its surroundings judged. */
export function extractDialogue(
  scenes: { sceneId: string; sceneTitle: string; chapterTitle: string; plainText: string }[],
): DialogueLine[] {
  const lines: DialogueLine[] = []
  for (const scene of scenes) {
    const text = scene.plainText
    for (const match of text.matchAll(/"([^"]+)"|“([^“”]+)”/g)) {
      const quote = (match[1] ?? match[2] ?? '').trim()
      if (!quote) continue
      const start = match.index ?? 0
      const before = text.slice(Math.max(0, start - 80), start)
      const after = text.slice(start + match[0].length, start + match[0].length + 80)
      lines.push({
        sceneId: scene.sceneId,
        sceneTitle: scene.sceneTitle,
        chapterTitle: scene.chapterTitle,
        quote,
        speaker: attributeQuote(before, after),
      })
    }
  }
  return lines
}

const STOPWORDS = new Set([
  'the', 'and', 'but', 'for', 'not', 'you', 'your', 'yours', 'that', 'this', 'then', 'than',
  'with', 'was', 'were', 'are', 'have', 'has', 'had', 'will', 'would', 'could', 'should',
  'she', 'her', 'hers', 'him', 'his', 'they', 'them', 'their', 'its', 'what', 'when', 'where',
  'who', 'why', 'how', 'all', 'any', 'can', 'did', 'does', 'don', 'just', 'out', 'now', 'get',
  'got', 'here', 'there', 'about', 'into', 'over', 'again', 'been', 'being', 'because', 'come',
  'came', 'know', 'like', 'well', 'yes', 'still',
])

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

function favouriteWords(quotes: string[], top = 3): string[] {
  const counts = new Map<string, number>()
  for (const quote of quotes) {
    for (const raw of words(quote)) {
      const word = raw.toLowerCase().replace(/[^a-z'’-]/g, '')
      if (word.length < 3 || STOPWORDS.has(word)) continue
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([word]) => word)
}

/** Per-voice statistics, loudest voice first, unattributed lines last. */
export function voiceStats(lines: DialogueLine[]): VoiceStats[] {
  const bySpeaker = new Map<string | null, DialogueLine[]>()
  for (const line of lines) {
    const list = bySpeaker.get(line.speaker) ?? []
    list.push(line)
    bySpeaker.set(line.speaker, list)
  }
  const totalWords = lines.reduce((sum, line) => sum + words(line.quote).length, 0)

  const stats = Array.from(bySpeaker.entries()).map(([speaker, spoken]): VoiceStats => {
    const wordCount = spoken.reduce((sum, line) => sum + words(line.quote).length, 0)
    return {
      speaker,
      lines: spoken.length,
      words: wordCount,
      share: totalWords === 0 ? 0 : wordCount / totalWords,
      avgLineWords: spoken.length === 0 ? 0 : wordCount / spoken.length,
      favourites: favouriteWords(spoken.map((line) => line.quote)),
    }
  })

  return stats.sort((a, b) => {
    if ((a.speaker === null) !== (b.speaker === null)) return a.speaker === null ? 1 : -1
    return b.words - a.words
  })
}

/** The optional AI voice check, built as messages for the writer's own key. */
export function buildVoiceCheckMessages(
  speaker: string,
  spoken: DialogueLine[],
): { role: 'system' | 'user'; content: string }[] {
  const numbered = spoken
    .map((line, i) => `${i + 1}. (${line.sceneTitle}) "${line.quote}"`)
    .join('\n')
  return [
    {
      role: 'system',
      content:
        'You are a dialogue voice checker for a novelist. You will get every line one character speaks, in book order. Judge whether the voice stays consistent: diction, rhythm, formality, verbal habits. Answer with a one-paragraph verdict, then a short list of the line numbers (if any) that break the voice, each with a phrase on why. Be concrete and quote the words at issue. Never rewrite the lines.',
    },
    {
      role: 'user',
      content: `Character: ${speaker}\n\nTheir lines, in order:\n${numbered}`,
    },
  ]
}
