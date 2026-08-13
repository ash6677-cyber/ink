/**
 * The whole-book read-through: the entire manuscript, read in order by a
 * model on the writer's own key, producing an editorial letter — the
 * $500 developmental-edit-lite, built honestly:
 *
 *  - the token estimate and (given the writer's own rate) approximate
 *    cost are computed BEFORE anything runs;
 *  - the book is read one chapter per request, each carrying a running
 *    memory of everything so far, so progress streams chapter by chapter;
 *  - after every chapter the state is persisted, so an interrupted run
 *    resumes where it stopped instead of paying for the book twice;
 *  - chapter notes stay tied to their chapter, so every claim in the
 *    letter links back to where it came from.
 *
 * Everything here is arithmetic and prompt-building; the network lives
 * in the panel.
 */

export interface ReadThroughChapter {
  title: string
  text: string
}

/** ~4 characters per token — the industry rule of thumb, labelled as one. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export interface ReadThroughEstimate {
  chapters: number
  /** Prompt tokens across all chapter passes, running memory included. */
  inputTokens: number
  /** A generous allowance for the model's replies. */
  outputTokens: number
}

/** The instructions + running memory each pass carries besides the prose. */
const PASS_OVERHEAD_TOKENS = 900

export function estimateReadThrough(chapters: ReadThroughChapter[]): ReadThroughEstimate {
  const inputTokens = chapters.reduce(
    (sum, chapter) => sum + approxTokens(chapter.text) + PASS_OVERHEAD_TOKENS,
    0,
  )
  // Chapter notes plus the final letter, roughly.
  const outputTokens = chapters.length * 350 + 1200
  return { chapters: chapters.length, inputTokens, outputTokens }
}

/** Cost at the writer's own rate (per million input tokens; output billed
 * the same for simplicity — this is an estimate, and says so). */
export function estimateCost(estimate: ReadThroughEstimate, ratePerMillion: number): number {
  return ((estimate.inputTokens + estimate.outputTokens) / 1_000_000) * ratePerMillion
}

export interface ChapterNote {
  chapterIndex: number
  chapterTitle: string
  note: string
}

/** What survives between passes and between sessions. */
export interface ReadThroughState {
  /** Chapters fully read; the next pass starts here. */
  nextChapter: number
  /** The model's running memory of the book so far. */
  memory: string
  notes: ChapterNote[]
  /** The final letter, once compiled. */
  letter: string | null
  /** Guard: a resumed run must belong to the same book shape. */
  chapterCount: number
}

export function emptyReadThroughState(chapterCount: number): ReadThroughState {
  return { nextChapter: 0, memory: '', notes: [], letter: null, chapterCount }
}

const MEMORY_MARK = 'MEMORY:'

export function buildChapterMessages(
  memory: string,
  chapter: ReadThroughChapter,
  index: number,
  total: number,
): { role: 'system' | 'user'; content: string }[] {
  return [
    {
      role: 'system',
      content:
        'You are a developmental editor reading a novel one chapter at a time, in order. For each chapter reply in exactly two parts: first NOTES: with 3-6 tight editorial observations for this chapter (pacing, character, promises made or paid off, anything dangling), then MEMORY: with an updated running memory of the whole book so far (threads still open, character arcs in motion, facts established) in under 250 words. The memory is your only recollection of earlier chapters — keep everything you will still need.',
    },
    {
      role: 'user',
      content:
        `Chapter ${index + 1} of ${total}: ${chapter.title}\n\n` +
        (memory ? `Your memory of the book so far:\n${memory}\n\n` : 'This is the first chapter.\n\n') +
        `The chapter:\n${chapter.text}`,
    },
  ]
}

/** Splits a chapter pass reply into its note and its updated memory. */
export function parseChapterReply(raw: string): { note: string; memory: string } {
  const markAt = raw.indexOf(MEMORY_MARK)
  if (markAt === -1) return { note: raw.replace(/^NOTES:\s*/i, '').trim(), memory: '' }
  return {
    note: raw.slice(0, markAt).replace(/^NOTES:\s*/i, '').trim(),
    memory: raw.slice(markAt + MEMORY_MARK.length).trim(),
  }
}

export function buildLetterMessages(
  notes: ChapterNote[],
  memory: string,
): { role: 'system' | 'user'; content: string }[] {
  const perChapter = notes
    .map((n) => `Chapter ${n.chapterIndex + 1} — ${n.chapterTitle}:\n${n.note}`)
    .join('\n\n')
  return [
    {
      role: 'system',
      content:
        'You are a developmental editor who has just finished reading a novel chapter by chapter. Write the editorial letter: an opening paragraph on what the book is and does well, then sections on pacing, character arcs, and dangling threads or unpaid setups. Every specific claim must name the chapter it comes from as "(Chapter N)". Close with the three highest-leverage revisions. Be concrete and kind; never rewrite prose.',
    },
    {
      role: 'user',
      content: `Your chapter-by-chapter notes:\n\n${perChapter}\n\nYour final memory of the book:\n${memory}`,
    },
  ]
}

/* ---- persistence: a run survives an interruption -------------------- */

const stateKey = (projectId: string) => `inkwell-read-through-${projectId}`

/** Injectable for tests, browser localStorage everywhere real. */
type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function loadReadThroughState(
  projectId: string,
  chapterCount: number,
  storage: KeyValueStore = localStorage,
): ReadThroughState | null {
  try {
    const raw = storage.getItem(stateKey(projectId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as ReadThroughState
    // The book changed shape since the run started: a resume would stitch
    // notes onto the wrong chapters. Start honest instead.
    if (parsed.chapterCount !== chapterCount) return null
    return parsed
  } catch {
    return null
  }
}

export function saveReadThroughState(
  projectId: string,
  state: ReadThroughState,
  storage: KeyValueStore = localStorage,
): void {
  try {
    storage.setItem(stateKey(projectId), JSON.stringify(state))
  } catch {
    // Storage blocked: the run still works, it just can't resume.
  }
}

export function clearReadThroughState(
  projectId: string,
  storage: KeyValueStore = localStorage,
): void {
  try {
    storage.removeItem(stateKey(projectId))
  } catch {
    /* nothing to clear */
  }
}
