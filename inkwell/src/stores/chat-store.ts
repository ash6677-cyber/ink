import { create } from 'zustand'

import { cardChatRepo } from '@/lib/db/repositories'
import type { CardChat, ChatMessage, ChatMode } from '@/types'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

function nowMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: Date.now(),
    swipes: role === 'assistant' ? [content] : [],
    activeSwipe: 0,
  }
}

function activeContent(message: ChatMessage): string {
  return message.role === 'assistant' ? (message.swipes[message.activeSwipe] ?? '') : message.content
}

interface ChatStoreState {
  projectId: string | null
  /** Every conversation in the open book, newest first. */
  chats: CardChat[]
  status: LoadStatus

  loadProject: (projectId: string) => Promise<void>
  createChat: (
    projectId: string,
    cardId: string,
    opts: { title: string; firstMessage: string; sceneId?: string | null; mode?: ChatMode },
  ) => Promise<CardChat>
  renameChat: (id: string, title: string) => Promise<void>
  deleteChat: (id: string) => Promise<void>
  setMode: (id: string, mode: ChatMode) => Promise<void>
  setPersona: (id: string, personaId: string | null) => Promise<void>
  setPreset: (id: string, aiPresetId: string | null) => Promise<void>

  sendUserMessage: (chatId: string, content: string) => Promise<void>
  appendAssistantMessage: (chatId: string, content: string) => Promise<ChatMessage>
  updateStreamingMessage: (chatId: string, messageId: string, content: string) => void
  addSwipe: (chatId: string, messageId: string, content: string) => Promise<void>
  setActiveSwipe: (chatId: string, messageId: string, index: number) => Promise<void>
  editMessage: (chatId: string, messageId: string, content: string) => Promise<void>
  deleteMessage: (chatId: string, messageId: string) => Promise<void>
}

function updateChatLocal(
  chats: CardChat[],
  chatId: string,
  fn: (chat: CardChat) => CardChat,
): CardChat[] {
  return chats.map((c) => (c.id === chatId ? fn(c) : c))
}

export const useChatStore = create<ChatStoreState>((set, get) => ({
  projectId: null,
  chats: [],
  status: 'idle',

  /**
   * Loaded per book rather than per card, because conversations now have a
   * home of their own: the Chats screen lists every one of them across the
   * whole cast, and a single conversation is reached by its own id rather
   * than through the card it belongs to. A card's sidebar filters this list
   * instead of fetching a second one.
   */
  loadProject: async (projectId) => {
    set({ status: 'loading', projectId })
    try {
      const all = await cardChatRepo.list()
      const chats = all
        .filter((c) => c.projectId === projectId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
      set({ chats, status: 'ready' })
    } catch {
      set({ status: 'error' })
    }
  },

  createChat: async (projectId, cardId, { title, firstMessage, sceneId, mode }) => {
    const messages = firstMessage.trim() ? [nowMessage('assistant', firstMessage.trim())] : []
    const chat = await cardChatRepo.create({
      cardId,
      projectId,
      mode: mode ?? 'roleplay',
      title,
      personaId: null,
      aiPresetId: null,
      messages,
      sceneId: sceneId ?? null,
    })
    set({ chats: [chat, ...get().chats] })
    return chat
  },

  renameChat: async (id, title) => {
    await cardChatRepo.update(id, { title })
    set({ chats: updateChatLocal(get().chats, id, (c) => ({ ...c, title })) })
  },

  deleteChat: async (id) => {
    await cardChatRepo.remove(id)
    set({ chats: get().chats.filter((c) => c.id !== id) })
  },

  setMode: async (id, mode) => {
    await cardChatRepo.update(id, { mode })
    set({ chats: updateChatLocal(get().chats, id, (c) => ({ ...c, mode })) })
  },

  setPersona: async (id, personaId) => {
    await cardChatRepo.update(id, { personaId })
    set({ chats: updateChatLocal(get().chats, id, (c) => ({ ...c, personaId })) })
  },

  setPreset: async (id, aiPresetId) => {
    await cardChatRepo.update(id, { aiPresetId })
    set({ chats: updateChatLocal(get().chats, id, (c) => ({ ...c, aiPresetId })) })
  },

  sendUserMessage: async (chatId, content) => {
    const chat = get().chats.find((c) => c.id === chatId)
    if (!chat) return
    const messages = [...chat.messages, nowMessage('user', content)]
    await cardChatRepo.update(chatId, { messages })
    set({ chats: updateChatLocal(get().chats, chatId, (c) => ({ ...c, messages })) })
  },

  appendAssistantMessage: async (chatId, content) => {
    const chat = get().chats.find((c) => c.id === chatId)
    if (!chat) throw new Error('Chat not found')
    const message = nowMessage('assistant', content)
    const messages = [...chat.messages, message]
    await cardChatRepo.update(chatId, { messages })
    set({ chats: updateChatLocal(get().chats, chatId, (c) => ({ ...c, messages })) })
    return message
  },

  // Local-only update while a response streams in — avoids hammering IndexedDB on
  // every token. The final content is persisted separately once streaming ends.
  updateStreamingMessage: (chatId, messageId, content) => {
    set({
      chats: updateChatLocal(get().chats, chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === messageId
            ? { ...m, swipes: m.swipes.map((s, i) => (i === m.activeSwipe ? content : s)) }
            : m,
        ),
      })),
    })
  },

  addSwipe: async (chatId, messageId, content) => {
    const chat = get().chats.find((c) => c.id === chatId)
    if (!chat) return
    const messages = chat.messages.map((m) =>
      m.id === messageId
        ? { ...m, swipes: [...m.swipes, content], activeSwipe: m.swipes.length }
        : m,
    )
    await cardChatRepo.update(chatId, { messages })
    set({ chats: updateChatLocal(get().chats, chatId, (c) => ({ ...c, messages })) })
  },

  setActiveSwipe: async (chatId, messageId, index) => {
    const chat = get().chats.find((c) => c.id === chatId)
    if (!chat) return
    const messages = chat.messages.map((m) => (m.id === messageId ? { ...m, activeSwipe: index } : m))
    await cardChatRepo.update(chatId, { messages })
    set({ chats: updateChatLocal(get().chats, chatId, (c) => ({ ...c, messages })) })
  },

  editMessage: async (chatId, messageId, content) => {
    const chat = get().chats.find((c) => c.id === chatId)
    if (!chat) return
    const messages = chat.messages.map((m) =>
      m.id === messageId
        ? m.role === 'assistant'
          ? { ...m, swipes: m.swipes.map((s, i) => (i === m.activeSwipe ? content : s)) }
          : { ...m, content }
        : m,
    )
    await cardChatRepo.update(chatId, { messages })
    set({ chats: updateChatLocal(get().chats, chatId, (c) => ({ ...c, messages })) })
  },

  deleteMessage: async (chatId, messageId) => {
    const chat = get().chats.find((c) => c.id === chatId)
    if (!chat) return
    const messages = chat.messages.filter((m) => m.id !== messageId)
    await cardChatRepo.update(chatId, { messages })
    set({ chats: updateChatLocal(get().chats, chatId, (c) => ({ ...c, messages })) })
  },
}))

export { activeContent }
