/**
 * The continuity sentinel.
 *
 * A long book accretes contradictions: eyes that were grey in chapter one
 * and green in chapter nine, a character who "had never been to the coast"
 * standing on a beach two hundred pages later. The sentinel hands the AI
 * the scene plus the established facts from the Almanac and asks, narrowly,
 * where the scene disagrees with the record — flagging, never fixing.
 *
 * Pure: it builds the fact sheet and the prompt, and parses the reply into
 * findings each tied to a real Almanac entry. No network, no DOM.
 */

import type { AiChatMessage } from '@/lib/ai/types'
import type { CodexEntry } from '@/types'

export type ContinuitySeverity = 'contradiction' | 'tension'

export interface ContinuityFinding {
  id: string
  /** The Almanac entry the scene disagrees with. */
  entryId: string
  entryName: string
  /** The established fact, from the Almanac. */
  fact: string
  /** What the scene says instead. */
  sceneClaim: string
  severity: ContinuitySeverity
  explanation: string
}

/** A compact fact sheet the model can check against — name, key traits,
 * and the summary line, per entry that has anything concrete to check. */
export function factSheet(entries: CodexEntry[]): string {
  const lines: string[] = []
  for (const entry of entries) {
    const facts: string[] = []
    if (entry.summary.trim()) facts.push(entry.summary.trim())
    for (const attr of entry.attributes) {
      if (attr.key.trim() && attr.value.trim()) facts.push(`${attr.key.trim()}: ${attr.value.trim()}`)
    }
    if (facts.length === 0) continue
    lines.push(`- [${entry.id}] ${entry.name}: ${facts.join('; ')}`)
  }
  return lines.join('\n')
}

const SYSTEM_PROMPT = `You are a continuity editor for a novel. You are given a set of ESTABLISHED
FACTS from the author's story bible, each tagged with an id like [abc123], and a
SCENE. Find only places where the scene CONTRADICTS or is in real TENSION with an
established fact — wrong eye colour, an impossible location, a changed name or
relationship, a broken timeline. Do NOT flag new information that merely adds to a
fact, stylistic choices, or anything you are unsure about.

Reply with ONLY a JSON array, no prose. Each element:
{"entryId":"<the [id] of the fact, without brackets>",
 "fact":"<the established fact, quoted>",
 "sceneClaim":"<what the scene says instead, quoted from the scene>",
 "severity":"contradiction"|"tension",
 "explanation":"<one short sentence>"}

If nothing conflicts, reply with []`

/** The messages for a continuity check of one scene against the fact sheet. */
export function buildContinuityMessages(sceneText: string, entries: CodexEntry[]): AiChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `ESTABLISHED FACTS:\n${factSheet(entries)}\n\nSCENE:\n${sceneText}`,
    },
  ]
}

/**
 * Parses the reply into findings that are actually usable: well-formed,
 * a known severity, and — the safety gate — an entryId that matches a real
 * Almanac entry, so a finding always links somewhere the writer can open.
 */
export function parseContinuityFindings(
  raw: string,
  entries: CodexEntry[],
  limit = 50,
): ContinuityFinding[] {
  const byId = new Map(entries.map((e) => [e.id, e]))
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const body = fenced ? fenced[1] : raw
  const start = body.indexOf('[')
  const end = body.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(body.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const out: ContinuityFinding[] = []
  const seen = new Set<string>()
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const entryId = typeof rec.entryId === 'string' ? rec.entryId.replace(/[[\]]/g, '') : ''
    const entry = byId.get(entryId)
    if (!entry) continue // the gate: no phantom entries
    const fact = typeof rec.fact === 'string' ? rec.fact : ''
    const sceneClaim = typeof rec.sceneClaim === 'string' ? rec.sceneClaim : ''
    if (!fact && !sceneClaim) continue
    const severity: ContinuitySeverity = rec.severity === 'tension' ? 'tension' : 'contradiction'
    const key = `${entryId}|${fact}|${sceneClaim}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: `cont-${out.length}`,
      entryId,
      entryName: entry.name,
      fact,
      sceneClaim,
      severity,
      explanation: typeof rec.explanation === 'string' ? rec.explanation : '',
    })
    if (out.length >= limit) break
  }
  return out
}

export const CONTINUITY_SEVERITY_LABEL: Record<ContinuitySeverity, string> = {
  contradiction: 'Contradiction',
  tension: 'Possible tension',
}
