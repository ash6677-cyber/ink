import type { AiPreset, CardChat, CharacterCard, ChatMessage, Lorebook, Persona } from '@/types'

import {
  CHARACTER_CONDUCT,
  THIN_CARD_NOTE,
  cardIsThin,
  conversationModeBrief,
} from './character-brief'
import { contextItem, excluded, makePlan, trimToTokens, type ContextItem, type ContextPlan } from './context-plan'
import { buildStoryDigest, EMPTY_DIGEST, type StoryScene } from './story-context'
import { estimateTokens } from './token-estimate'
import type { AiChatMessage } from './types'

export interface ChatPromptInput {
  card: CharacterCard
  chat: CardChat
  persona: Persona | null
  lorebooks: Lorebook[]
  preset: AiPreset
  history: ChatMessage[]
  /**
   * The manuscript this character lives in, so they can remember it. Left out
   * for a card that belongs to no project — the chat still works, the
   * character simply has no book behind them.
   */
  scenes?: StoryScene[]
  /** Names the character answers to in the prose, beyond their card name. */
  aliases?: string[]
  /** A specific scene the author brought to talk over: its prose rides in
   * the prompt so the character has actually "read" it. */
  discussScene?: { title: string; text: string } | null
}

export interface BuiltChatPrompt {
  messages: AiChatMessage[]
  estimatedTokens: number
  /** Everything considered, sent or not, with reasons. */
  plan: ContextPlan
}

function activeContent(message: ChatMessage): string {
  return message.role === 'assistant' ? (message.swipes[message.activeSwipe] ?? '') : message.content
}

/**
 * Which world info reaches the model, and — the part that used to be
 * invisible — which does not.
 *
 * A lorebook entry can miss for four different reasons, and a writer wondering
 * why their character has never heard of the salt tax deserves to be told
 * which one it was rather than left to guess at the machinery.
 */
function planLorebook(
  lorebooks: Lorebook[],
  recentText: string,
  tokenBudget: number,
): { text: string; items: ContextItem[] } {
  const haystack = recentText.toLowerCase()
  const items: ContextItem[] = []
  const kept: string[] = []

  const named = lorebooks.flatMap((lb) => lb.entries.map((entry) => ({ entry, book: lb.name })))
  const label = (e: (typeof named)[number]) =>
    e.entry.keywords.filter((k) => k.trim())[0]?.trim() || 'Untitled entry'

  const candidates: typeof named = []
  for (const item of named) {
    const { entry } = item
    if (!entry.enabled) {
      items.push(excluded(entry.id, label(item), entry.content, 'Switched off in the lorebook.', item.book))
      continue
    }
    if (entry.constant) {
      candidates.push(item)
      continue
    }
    const hit = entry.keywords.some((kw) => kw.trim() && haystack.includes(kw.trim().toLowerCase()))
    if (!hit) {
      items.push(
        excluded(
          entry.id,
          label(item),
          entry.content,
          'None of its keywords appear in the recent conversation.',
          item.book,
        ),
      )
      continue
    }
    candidates.push(item)
  }

  candidates.sort((a, b) => b.entry.priority - a.entry.priority)

  const budget = tokenBudget > 0 ? tokenBudget : Infinity
  let used = 0
  for (const item of candidates) {
    const { entry } = item
    const remaining = budget - used
    if (remaining <= 0) {
      items.push(excluded(entry.id, label(item), entry.content, 'The world-info budget was already full.', item.book))
      continue
    }
    const entryBudget = entry.tokenBudget > 0 ? Math.min(entry.tokenBudget, remaining) : remaining
    const { text, trimmed } = trimToTokens(entry.content, entryBudget)
    const tokens = estimateTokens(text)
    if (tokens === 0) {
      items.push(excluded(entry.id, label(item), entry.content, 'No room left in the world-info budget.', item.book))
      continue
    }
    kept.push(text)
    used += tokens
    items.push(
      contextItem(entry.id, label(item), text, {
        outcome: trimmed ? 'trimmed' : 'included',
        reason: trimmed ? 'Cut short to fit the world-info budget.' : undefined,
        source: item.book,
      }),
    )
  }

  return { text: kept.join('\n\n'), items }
}

function buildCharacterSystemPrompt(
  card: CharacterCard,
  persona: Persona | null,
  mode: CardChat['mode'],
): string {
  // An override replaces the description of *who* this is. The conduct below
  // still applies: a writer who rewrites a character's identity has not asked
  // for a character who answers unhelpfully.
  const identity: string[] = []
  if (card.systemPromptOverride?.trim()) {
    identity.push(card.systemPromptOverride.trim())
  } else {
    identity.push(`You are ${card.displayName || 'a character in this book'}.`)
    if (card.description.trim()) identity.push(`Description: ${card.description.trim()}`)
    if (card.personality.trim()) identity.push(`Personality: ${card.personality.trim()}`)
    if (card.scenario.trim()) identity.push(`Scenario: ${card.scenario.trim()}`)
    if (card.voiceNotes.trim()) identity.push(`Voice and speech patterns: ${card.voiceNotes.trim()}`)
    if (cardIsThin(card)) identity.push(THIN_CARD_NOTE)
  }

  if (card.exampleDialogue.length > 0) {
    const personaName = persona?.name || 'the author'
    const examples = card.exampleDialogue
      .map((line) => `${personaName}: ${line.input}\n${card.displayName}: ${line.response}`)
      .join('\n\n')
    identity.push(`Example exchanges (for voice and tone only, not part of this conversation):\n${examples}`)
  }

  identity.push(
    persona
      ? `You are talking with ${persona.name}, who is writing this book.${persona.description.trim() ? ` About them: ${persona.description.trim()}` : ''}`
      : 'You are talking with the author of the book you are in.',
  )

  identity.push(CHARACTER_CONDUCT)
  identity.push(conversationModeBrief(mode))

  return identity.join('\n\n')
}

export function buildChatPrompt(input: ChatPromptInput): BuiltChatPrompt {
  const { card, chat, persona, lorebooks, preset, history, scenes, aliases, discussScene } = input

  const characterPrompt = buildCharacterSystemPrompt(card, persona, chat.mode)

  // What the manuscript says has happened to them. Budgeted against the same
  // world-info allowance as lorebooks when one is set, because both are
  // background the model is asked to hold in mind at once.
  const storyDigest = scenes?.length
    ? buildStoryDigest(
        { id: card.id, name: card.displayName, aliases: aliases ?? [] },
        scenes,
        { tokenBudget: preset.contextRules.lorebookTokenBudget || 900 },
      )
    : EMPTY_DIGEST

  const recentText = history
    .slice(-6)
    .map((m) => activeContent(m))
    .join('\n')
  const lorebookPlan = preset.contextRules.includeLorebook
    ? planLorebook(lorebooks, recentText, preset.contextRules.lorebookTokenBudget)
    : {
        text: '',
        items: lorebooks
          .flatMap((lb) => lb.entries.map((entry) => ({ entry, book: lb.name })))
          .map(({ entry, book }) =>
            excluded(
              entry.id,
              entry.keywords.filter((k) => k.trim())[0]?.trim() || 'Untitled entry',
              entry.content,
              'World info is switched off for this preset.',
              book,
            ),
          ),
      }
  const lorebookContext = lorebookPlan.text

  const systemParts = [characterPrompt]
  if (discussScene?.text) {
    systemParts.push(
      `The author has brought one scene to talk over with you — "${discussScene.title}". ` +
        `You were there (or it concerns you); speak from inside it. The scene:\n\n${discussScene.text}`,
    )
  }
  if (storyDigest.text) systemParts.push(`What has happened to you in the book so far:\n${storyDigest.text}`)
  if (lorebookContext) systemParts.push(`World info:\n${lorebookContext}`)
  if (preset.systemPrompt.trim()) systemParts.push(preset.systemPrompt.trim())
  const systemPrompt = systemParts.join('\n\n---\n\n')

  const historyMessages: AiChatMessage[] = history
    .map((m) => ({ role: m.role, content: activeContent(m) }))
    .filter((m) => m.content.trim())

  const messages: AiChatMessage[] = [{ role: 'system', content: systemPrompt }, ...historyMessages]

  const items: ContextItem[] = [
    contextItem('character', `Who ${card.displayName} is`, characterPrompt, { source: 'This card' }),
  ]
  if (persona) {
    items.push(
      contextItem('persona', `Who you are (${persona.name})`, persona.description || persona.name, {
        source: 'Persona',
      }),
    )
  }
  if (discussScene?.text) {
    items.push(
      contextItem('discuss-scene', `The scene under discussion (“${discussScene.title}”)`, discussScene.text, {
        source: 'The manuscript',
      }),
    )
  }
  if (storyDigest.text) {
    items.push(
      contextItem(
        'story',
        `Your story so far (${storyDigest.moments.length} of ${storyDigest.sceneCount} ${storyDigest.sceneCount === 1 ? 'scene' : 'scenes'})`,
        storyDigest.text,
        { source: 'The manuscript' },
      ),
    )
  } else if (scenes?.length) {
    items.push(
      excluded(
        'story',
        'Your story so far',
        '',
        `${card.displayName} is not named anywhere in the manuscript yet.`,
        'The manuscript',
      ),
    )
  }
  items.push(...lorebookPlan.items)
  if (preset.systemPrompt.trim()) {
    items.push(
      contextItem('preset-system', 'Your own instructions', preset.systemPrompt.trim(), {
        source: preset.name,
      }),
    )
  }
  items.push(
    contextItem(
      'history',
      `The conversation so far (${historyMessages.length} ${historyMessages.length === 1 ? 'message' : 'messages'})`,
      historyMessages.map((m) => m.content).join('\n\n'),
      { source: 'This chat' },
    ),
  )

  const plan = makePlan(items)
  return { messages, estimatedTokens: plan.includedTokens, plan }
}
