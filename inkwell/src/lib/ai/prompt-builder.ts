import type { AiActionKind, AiPreset, CodexEntry, PointOfView, Tense } from '@/types'

import { contextItem, excluded, makePlan, type ContextItem, type ContextPlan, trimToTokens } from './context-plan'
import { estimateTokens } from './token-estimate'
import type { AiChatMessage } from './types'

export interface PromptBuilderInput {
  preset: AiPreset
  action: AiActionKind
  instruction: string
  precedingText: string
  selectedText?: string
  codexEntries: CodexEntry[]
  pov: PointOfView
  tense: Tense
}

export interface BuiltPrompt {
  messages: AiChatMessage[]
  estimatedTokens: number
  /** Everything considered, sent or not, with reasons. */
  plan: ContextPlan
}

const POV_LABEL: Record<PointOfView, string> = {
  first: 'first person',
  second: 'second person',
  'third-limited': 'third person limited',
  'third-omniscient': 'third person omniscient',
  multiple: 'multiple POV',
}

function entryBlock(entry: CodexEntry): string {
  const attrLines = entry.attributes.map((a) => `- ${a.key}: ${a.value}`).join('\n')
  return `### ${entry.name} (${entry.type})\n${entry.summary}${attrLines ? `\n${attrLines}` : ''}`
}

/**
 * Which Almanac entries reach the model, and why the rest do not.
 *
 * An entry can miss for three quite different reasons — the writer set it to
 * never, it was not mentioned nearby, or the budget ran out before its turn —
 * and those call for three different actions. Reporting only the survivors
 * made every one of them look the same from outside.
 */
function planCodex(
  entries: CodexEntry[],
  relevanceText: string,
  tokenBudget: number,
): { text: string; items: ContextItem[] } {
  const haystack = relevanceText.toLowerCase()
  const items: ContextItem[] = []
  const relevant: CodexEntry[] = []

  for (const entry of entries) {
    if (entry.aiContext === 'never') {
      items.push(
        excluded(entry.id, entry.name, entryBlock(entry), 'Set to never be sent to the AI.', 'Almanac'),
      )
      continue
    }
    if (entry.aiContext === 'always') {
      relevant.push(entry)
      continue
    }
    const name = entry.name.toLowerCase()
    const mentioned =
      (name && haystack.includes(name)) ||
      entry.aliases.some((alias) => alias.trim() && haystack.includes(alias.toLowerCase()))
    if (!mentioned) {
      items.push(
        excluded(
          entry.id,
          entry.name,
          entryBlock(entry),
          'Not mentioned in the text nearby, and set to be sent only when relevant.',
          'Almanac',
        ),
      )
      continue
    }
    relevant.push(entry)
  }

  const budget = tokenBudget > 0 ? tokenBudget : Infinity
  let used = 0
  const blocks: string[] = []
  for (const entry of relevant) {
    const rawBlock = entryBlock(entry)
    // The entry's own budget, honoured at last: the field existed on the
    // record (and in the form) with no consumer, which made it dishonest UI.
    // Same contract as lorebook entries — the entry may spend at most its
    // own cap, and the preview says so when it was cut to fit.
    const cap = entry.aiContextTokenBudget ?? 0
    const { text: block, trimmed } =
      cap > 0 ? trimToTokens(rawBlock, cap) : { text: rawBlock, trimmed: false }
    const blockTokens = estimateTokens(block)
    if (used + blockTokens > budget) {
      items.push(
        excluded(entry.id, entry.name, block, 'The Almanac budget was full before it got here.', 'Almanac'),
      )
      continue
    }
    blocks.push(block)
    used += blockTokens
    items.push(
      contextItem(entry.id, entry.name, block, {
        source: 'Almanac',
        ...(trimmed
          ? { outcome: 'trimmed', reason: `Capped at this entry's own ${cap}-token budget.` }
          : {}),
      }),
    )
  }

  return { text: blocks.join('\n\n'), items }
}

function lastParagraphs(text: string, count: number): string {
  if (count <= 0) return ''
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim())
  return paragraphs.slice(-count).join('\n\n')
}

function actionInstruction(input: PromptBuilderInput): string {
  const { action, instruction, selectedText } = input
  switch (action) {
    case 'continue':
      return "Continue the prose naturally from exactly where it leaves off, in the established voice, POV, and tense. Don't repeat what's already written, and don't add headings or commentary — prose only."
    case 'rewrite':
      return `Rewrite the following passage.${instruction ? ` Instruction: ${instruction}` : ''} Preserve meaning and continuity with the surrounding scene unless told otherwise. Return only the rewritten passage.\n\nPassage:\n${selectedText ?? ''}`
    case 'describe':
      return `Write a vivid description for: ${instruction || 'the current subject'}. Match the established voice and tense. Keep it to two to four sentences unless told otherwise. Return only the description.`
    case 'brainstorm':
      return `Brainstorm ideas for: ${instruction || 'what could happen next'}. Offer four to six distinct, concrete options as a short list. These are just ideas — not prose to insert.`
    case 'summarise':
      return 'Summarise the scene below in two to three sentences, capturing the key events and character beats. Return only the summary.'
    case 'beats-to-prose':
      return `Expand the following beats into continuous prose, in the established voice, POV, and tense. Cover every beat in order and turn them into a flowing scene — not a list, headings, or commentary. Return only the prose.\n\nBeats:\n${instruction}`
  }
}

export function buildPrompt(input: PromptBuilderInput): BuiltPrompt {
  const { preset, precedingText, codexEntries, pov, tense } = input

  const systemLines = [
    preset.systemPrompt.trim() ||
      'You are a skilled fiction co-writer helping a novelist draft their manuscript.',
    `Write in ${POV_LABEL[pov]}, ${tense} tense.`,
  ]
  if (preset.proseInstructions.trim()) systemLines.push(preset.proseInstructions.trim())
  const systemPrompt = systemLines.join('\n\n')

  const relevanceText = `${precedingText}\n${input.selectedText ?? ''}\n${input.instruction}`
  const codexPlan = preset.contextRules.includeCodex
    ? planCodex(codexEntries, relevanceText, preset.contextRules.codexTokenBudget)
    : {
        text: '',
        items: codexEntries.map((entry) =>
          excluded(
            entry.id,
            entry.name,
            entryBlock(entry),
            'Almanac context is switched off for this preset.',
            'Almanac',
          ),
        ),
      }
  const codexContext = codexPlan.text

  const preceding =
    input.action === 'summarise'
      ? precedingText
      : lastParagraphs(precedingText, preset.contextRules.precedingParagraphs)

  const instructionText = actionInstruction(input)

  const items: ContextItem[] = [
    contextItem('system', 'How the AI is told to write', systemPrompt, { source: preset.name }),
    ...codexPlan.items,
  ]
  if (preceding) {
    items.push(
      contextItem(
        'preceding',
        input.action === 'summarise' ? 'The scene itself' : 'What you have written just before',
        preceding,
        { source: 'Manuscript' },
      ),
    )
  }
  items.push(contextItem('instruction', 'What you asked for', instructionText, { source: 'This request' }))

  const userParts = [
    codexContext && `Relevant worldbuilding context:\n${codexContext}`,
    preceding && `${input.action === 'summarise' ? 'Scene' : 'Preceding text'}:\n${preceding}`,
    instructionText,
  ].filter(Boolean)

  const messages: AiChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userParts.join('\n\n---\n\n') },
  ]

  const plan = makePlan(items)
  return { messages, estimatedTokens: plan.includedTokens, plan }
}
