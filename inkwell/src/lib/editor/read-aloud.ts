/**
 * Read-aloud proofing.
 *
 * Hearing a sentence catches what the eye skates over — a dropped word, a
 * clumsy repeat, a rhythm that trips. This reads the scene back through the
 * browser's own speech synthesis: free, offline, no key, no account.
 *
 * The only part worth testing without a speech engine is how prose is cut
 * into speakable chunks — utterances have length limits and, more
 * importantly, chunking at sentence boundaries is what lets playback
 * highlight where it is and stop cleanly between sentences. That logic is
 * pure and lives here; the engine wrapper is a thin controller below it.
 */

/** Longest single utterance we'll hand the engine; some voices choke past
 * a few hundred characters and simply go silent. */
const MAX_CHUNK = 240

/**
 * Splits prose into speakable chunks at sentence boundaries, falling back
 * to word boundaries for a sentence longer than one utterance can carry.
 * Whitespace-only input yields nothing.
 */
export function chunkForSpeech(text: string, maxChunk = MAX_CHUNK): string[] {
  const normalised = text.replace(/\s+/g, ' ').trim()
  if (!normalised) return []

  // Keep the terminator with its sentence so the voice hears the full stop.
  const sentences = normalised.match(/[^.!?]+[.!?]*\s*/g) ?? [normalised]

  const chunks: string[] = []
  for (const raw of sentences) {
    const sentence = raw.trim()
    if (!sentence) continue
    if (sentence.length <= maxChunk) {
      chunks.push(sentence)
      continue
    }
    // Too long for one utterance: break on words, never mid-word.
    let current = ''
    for (const word of sentence.split(' ')) {
      if (current && current.length + 1 + word.length > maxChunk) {
        chunks.push(current)
        current = word
      } else {
        current = current ? `${current} ${word}` : word
      }
    }
    if (current) chunks.push(current)
  }
  return chunks
}

/** Whether this browser can speak at all — the button hides otherwise. */
export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export type ReadAloudState = 'idle' | 'playing' | 'paused'

export interface ReadAloudController {
  play: (text: string) => void
  pause: () => void
  resume: () => void
  stop: () => void
}

/**
 * A thin controller over `speechSynthesis`: speaks a text as a queue of
 * sentence utterances, reporting state changes. Kept out of React so the
 * hook around it stays tiny; kept out of the pure module so tests never
 * touch a speech engine that headless browsers don't provide.
 */
export function createReadAloud(onState: (state: ReadAloudState) => void): ReadAloudController {
  const synth = speechSupported() ? window.speechSynthesis : null

  function stop() {
    synth?.cancel()
    onState('idle')
  }

  function play(text: string) {
    if (!synth) return
    synth.cancel()
    const chunks = chunkForSpeech(text)
    if (chunks.length === 0) {
      onState('idle')
      return
    }
    let index = 0
    const speakNext = () => {
      if (index >= chunks.length) {
        onState('idle')
        return
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index])
      index += 1
      utterance.onend = speakNext
      utterance.onerror = () => onState('idle')
      synth.speak(utterance)
    }
    onState('playing')
    speakNext()
  }

  function pause() {
    if (synth?.speaking) {
      synth.pause()
      onState('paused')
    }
  }

  function resume() {
    if (synth?.paused) {
      synth.resume()
      onState('playing')
    }
  }

  return { play, pause, resume, stop }
}
