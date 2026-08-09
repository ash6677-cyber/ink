/**
 * The proofread pass: a light copy-edit, not a rewrite.
 *
 * The model is asked to return a plain JSON list of small, local fixes —
 * typos, grammar slips, repeated words, and echoes (the same distinctive
 * word twice in close quarters) — each quoting the exact text to change so
 * the app can find it and swap it on a single click, or throw it away.
 *
 * Nothing here talks to a network or a DOM: it builds the prompt and parses
 * the reply. That keeps the judgement calls — what counts as a valid, safe,
 * applicable suggestion — under unit test, where they belong.
 */

import type { AiChatMessage } from '@/lib/ai/types'

export type ProofreadCategory = 'typo' | 'grammar' | 'repeat' | 'echo' | 'style'

export interface ProofreadSuggestion {
  id: string
  category: ProofreadCategory
  /** The exact text to replace — must occur verbatim in the scene. */
  original: string
  /** What to put in its place. Empty string means "delete this". */
  suggestion: string
  /** One short sentence on why. */
  explanation: string
}

const CATEGORIES: ProofreadCategory[] = ['typo', 'grammar', 'repeat', 'echo', 'style']

const SYSTEM_PROMPT = `You are a meticulous copy-editor proofreading a passage of a novel.
Find only small, local, high-confidence fixes: spelling and typos, clear grammar
and punctuation errors, accidentally repeated words, and distracting echoes (the
same distinctive word repeated in close proximity). Do NOT rewrite for style,
change the author's voice, alter meaning, or suggest large restructuring.

Reply with ONLY a JSON array, no prose before or after. Each element:
{"category":"typo"|"grammar"|"repeat"|"echo"|"style",
 "original":"<the exact text to replace, copied verbatim from the passage>",
 "suggestion":"<the replacement text; use an empty string to delete>",
 "explanation":"<one short sentence>"}

"original" MUST be copied exactly from the passage, long enough to be unique.
If the passage is clean, reply with an empty array: []`

/** The messages for a proofread run over one passage. */
export function buildProofreadMessages(passage: string): AiChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Proofread this passage:\n\n${passage}` },
  ]
}

/** Pulls the first JSON array out of a model reply, tolerating code fences
 * and any stray words a model insists on adding around it. */
function extractJsonArray(raw: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const body = fenced ? fenced[1] : raw
  const start = body.indexOf('[')
  const end = body.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return null
  return body.slice(start, end + 1)
}

interface ParseOptions {
  /** The passage the suggestions must apply to; anything whose `original`
   * isn't found here is dropped as unusable. */
  passage: string
  /** Cap so a runaway reply can't flood the UI. */
  limit?: number
}

/**
 * Turns a model reply into suggestions that are actually safe to apply:
 * well-formed, in a known category, non-empty original, and — crucially —
 * an `original` that occurs verbatim in the passage, so accepting it can
 * never corrupt text the model only imagined. Duplicates collapse.
 */
export function parseProofreadSuggestions(
  raw: string,
  { passage, limit = 100 }: ParseOptions,
): ProofreadSuggestion[] {
  const json = extractJsonArray(raw)
  if (!json) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const out: ProofreadSuggestion[] = []
  const seen = new Set<string>()
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const category = record.category
    const original = record.original
    const suggestion = record.suggestion
    const explanation = record.explanation

    if (typeof original !== 'string' || original.length === 0) continue
    if (typeof suggestion !== 'string') continue
    // The safety gate: never offer to change text that isn't there.
    if (!passage.includes(original)) continue
    // A no-op fix is noise.
    if (original === suggestion) continue

    const cat: ProofreadCategory = CATEGORIES.includes(category as ProofreadCategory)
      ? (category as ProofreadCategory)
      : 'style'
    const key = `${original}→${suggestion}`
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      id: `pf-${out.length}`,
      category: cat,
      original,
      suggestion,
      explanation: typeof explanation === 'string' ? explanation : '',
    })
    if (out.length >= limit) break
  }
  return out
}

export const PROOFREAD_CATEGORY_LABEL: Record<ProofreadCategory, string> = {
  typo: 'Typo',
  grammar: 'Grammar',
  repeat: 'Repeated word',
  echo: 'Echo',
  style: 'Style',
}
