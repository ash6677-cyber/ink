import { presetForFeature } from '@/lib/ai/feature-preset'
import { usePreferencesStore } from '@/stores/preferences-store'
import {
  ArrowLeft,
  BookMarked,
  Eye,
  MessageSquarePlus,
  MoreHorizontal,
  PanelLeft,
  PlugZap,
  Send,
  Settings2,
  Square,
  Trash2,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { EmptyState } from '@/components/common/empty-state'
import { VisuallyHidden } from '@/components/common/visually-hidden'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { ChatMessageBubble } from '@/features/playground/components/chat-message-bubble'
import { PersonaManagerDialog } from '@/features/playground/components/persona-manager-dialog'
import { SaveLineDialog } from '@/features/playground/components/save-line-dialog'
import { nextChatTitle } from '@/features/playground/lib/open-chat'
import { playgroundPath } from '@/features/playground/lib/playground-nav'
import { AiFailureNotice } from '@/components/common/ai-failure-notice'
import { ContextPreview } from '@/components/common/context-preview'
import { buildChatPrompt } from '@/lib/ai/chat-prompt-builder'
import { resolveProvider } from '@/lib/ai/resolve-provider'
import { useAiGeneration } from '@/lib/ai/use-ai-generation'
import { useStoryScenes } from '@/lib/hooks/use-story-scenes'
import { ProviderFormDialog } from '@/features/settings/components/provider-form-dialog'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { cn } from '@/lib/utils'
import { useAiStore } from '@/stores/ai-store'
import { useCodexStore } from '@/stores/codex-store'
import { useCardStore } from '@/stores/card-store'
import { useChatStore } from '@/stores/chat-store'
import { useLorebookStore } from '@/stores/lorebook-store'
import { usePersonaStore } from '@/stores/persona-store'
import type { ChatMessage, ChatMode } from '@/types'
import { useDocumentTitle } from '@/lib/hooks/use-document-title'

export function CardChat() {
  // A conversation is addressed by its own id now. It used to be reached
  // through the card it belonged to, which is why past chats had no home of
  // their own and could not be listed together.
  const { chatId } = useParams<{ chatId: string }>()
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('project')
  const navigate = useNavigate()
  const { toast } = useToast()

  const allChats = useChatStore((s) => s.chats)
  const chatStatus = useChatStore((s) => s.status)
  const loadChats = useChatStore((s) => s.loadProject)
  const activeChat = useMemo(
    () => allChats.find((c) => c.id === chatId) ?? null,
    [allChats, chatId],
  )

  const cards = useCardStore((s) => s.cards)
  const cardStatus = useCardStore((s) => s.status)
  const loadCardsProject = useCardStore((s) => s.loadProject)
  const cardId = activeChat?.cardId
  const card = useMemo(() => cards.find((c) => c.id === cardId), [cards, cardId])
  useDocumentTitle(card?.displayName, 'Chat', 'Playground')

  // The sidebar is still this character's conversations; it filters the
  // book-wide list rather than fetching a second one.
  const chats = useMemo(
    () => (cardId ? allChats.filter((c) => c.cardId === cardId) : []),
    [allChats, cardId],
  )
  const createChat = useChatStore((s) => s.createChat)
  const renameChat = useChatStore((s) => s.renameChat)
  const deleteChat = useChatStore((s) => s.deleteChat)
  const setMode = useChatStore((s) => s.setMode)
  const setPersonaId = useChatStore((s) => s.setPersona)
  const setPresetId = useChatStore((s) => s.setPreset)
  const sendUserMessage = useChatStore((s) => s.sendUserMessage)
  const appendAssistantMessage = useChatStore((s) => s.appendAssistantMessage)
  const addSwipe = useChatStore((s) => s.addSwipe)
  const setActiveSwipe = useChatStore((s) => s.setActiveSwipe)
  const editMessage = useChatStore((s) => s.editMessage)
  const deleteMessage = useChatStore((s) => s.deleteMessage)

  const personas = usePersonaStore((s) => s.personas)
  const loadPersonas = usePersonaStore((s) => s.loadAll)

  const lorebooks = useLorebookStore((s) => s.lorebooks)
  const loadLorebooksProject = useLorebookStore((s) => s.loadProject)

  const presets = useAiStore((s) => s.presets)
  const providers = useAiStore((s) => s.providers)
  const loadAiStore = useAiStore((s) => s.loadAll)
  const createProvider = useAiStore((s) => s.createProvider)

  useEffect(() => {
    if (projectId) loadCardsProject(projectId)
  }, [projectId, loadCardsProject])
  useEffect(() => {
    if (projectId) loadChats(projectId)
  }, [projectId, loadChats])
  useEffect(() => {
    loadPersonas()
  }, [loadPersonas])
  useEffect(() => {
    if (projectId) loadLorebooksProject(projectId)
  }, [projectId, loadLorebooksProject])
  useEffect(() => {
    loadAiStore()
  }, [loadAiStore])

  const [text, setText] = useState('')
  const [mobileListOpen, setMobileListOpen] = useState(false)
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  // The chat list is a sidebar on a wide screen and a Sheet on a narrow one —
  // the same list either way, mounted once rather than twice.
  const wideEnoughForSidebar = useMediaQuery('(min-width: 1024px)')
  const [keeping, setKeeping] = useState<string | null>(null)
  const [personaManagerOpen, setPersonaManagerOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null)
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { output, streaming, failure, attempt, generate, stop, reset } = useAiGeneration()

  const persona = personas.find((p) => p.id === activeChat?.personaId) ?? null
  const featurePresets = usePreferencesStore((s) => s.featurePresets)
  // A per-chat choice always wins; with none, the chat feature's own default
  // (Settings → AI), then the global default.
  const preset =
    presets.find((p) => p.id === activeChat?.aiPresetId) ??
    presetForFeature(presets, 'chat', featurePresets)
  // Falls back to any working key rather than only the one this preset names.
  // Every preset the app ships with starts pointing at nothing, so the strict
  // version meant a writer could add a key and still get silence.
  const resolved = resolveProvider(preset, providers)
  const provider = resolved?.provider
  const personaName = persona?.name ?? 'You'

  // The book this character is in, so they can remember what happened in it.
  const scenes = useStoryScenes(projectId)
  const codexEntries = useCodexStore((s) => s.entries)
  const linkedEntry = card?.codexEntryId
    ? codexEntries.find((e) => e.id === card.codexEntryId)
    : undefined

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [activeChat?.messages.length, output])

  async function handleNewChat() {
    if (!projectId || !cardId || !card) return
    const created = await createChat(projectId, cardId, {
      title: nextChatTitle(chats.length),
      firstMessage: card.firstMessage,
    })
    setMobileListOpen(false)
    navigate(playgroundPath('chats', projectId, `/${created.id}`))
  }

  async function runGeneration(chatId: string, history: ChatMessage[], messageId: string) {
    if (!card || !activeChat || !preset || !provider) return
    setPendingMessageId(messageId)
    reset()
    const built = buildChatPrompt({
      card,
      chat: activeChat,
      persona,
      lorebooks,
      preset,
      history,
      scenes,
      aliases: linkedEntry?.aliases ?? [],
    })
    const finalText = await generate({
      provider,
      model: resolved?.model || '',
      messages: built.messages,
      temperature: preset.temperature,
      topP: preset.topP,
    })
    if (finalText.trim()) {
      await editMessage(chatId, messageId, finalText)
    } else {
      await deleteMessage(chatId, messageId)
    }
    setPendingMessageId(null)
  }

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || !activeChat) return
    setText('')
    await sendUserMessage(activeChat.id, trimmed)

    if (!preset || !provider) {
      toast({
        title: 'No AI connected yet',
        description: 'Your message is saved. Connect an AI below and ask again for a reply.',
      })
      return
    }

    const freshChat = useChatStore.getState().chats.find((c) => c.id === activeChat.id)
    if (!freshChat) return
    const placeholder = await appendAssistantMessage(activeChat.id, '')
    await runGeneration(activeChat.id, freshChat.messages, placeholder.id)
  }

  /**
   * Ask again, without making the writer retype what they said.
   *
   * A failed send leaves their message in the conversation and an empty reply
   * after it; retrying replaces that empty reply rather than adding a second
   * one, so the thread reads as one exchange that took two attempts.
   */
  async function retryLastSend() {
    if (!activeChat || !preset || !provider) return
    const chat = useChatStore.getState().chats.find((c) => c.id === activeChat.id)
    if (!chat) return
    const last = chat.messages[chat.messages.length - 1]
    if (last?.role === 'assistant' && !last.swipes.some((s) => s.trim())) {
      await runGeneration(chat.id, chat.messages.slice(0, -1), last.id)
      return
    }
    const placeholder = await appendAssistantMessage(chat.id, '')
    await runGeneration(chat.id, chat.messages, placeholder.id)
  }

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={ArrowLeft}
          title="No project selected"
          description="Open a project from the Projects page to see its conversations."
          action={
            <Button asChild>
              <Link to="/projects">Go to Projects</Link>
            </Button>
          }
        />
      </div>
    )
  }

  // Both stores have to answer before "not found" can be true: the chat says
  // which card this is, and the card list says who they are.
  const stillLoading =
    chatStatus === 'idle' ||
    chatStatus === 'loading' ||
    (cardStatus !== 'ready' && cards.length === 0)
  if (stillLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-96 w-full" />
      </div>
    )
  }

  if (!activeChat) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={ArrowLeft}
          title="Conversation not found"
          description="It may have been deleted."
          action={
            <Button asChild>
              <Link to={playgroundPath('chats', projectId)}>Back to Chats</Link>
            </Button>
          }
        />
      </div>
    )
  }

  if (!card) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={ArrowLeft}
          title="Character not found"
          description="The character this conversation belongs to may have been deleted."
          action={
            <Button asChild>
              <Link to={playgroundPath('chats', projectId)}>Back to Chats</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const chatListContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between p-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Chats</span>
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-xs" onClick={handleNewChat}>
          <MessageSquarePlus className="size-3.5" /> New
        </Button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {chats.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">No chats yet.</p>
        ) : (
          chats.map((chat) => (
            <div
              key={chat.id}
              className={cn(
                'group flex items-center gap-1 rounded-md px-2 py-2 text-sm',
                chat.id === chatId
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => {
                  setMobileListOpen(false)
                  navigate(playgroundPath('chats', projectId, `/${chat.id}`))
                }}
              >
                {chat.title}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`More actions for ${chat.title}`}
                    className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-secondary hover:text-foreground group-hover:opacity-100"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      const next = prompt('Rename chat', chat.title)
                      if (next?.trim()) renameChat(chat.id, next.trim())
                    }}
                  >
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setDeletingChatId(chat.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            onClick={() => setMobileListOpen(true)}
            aria-label="Open chat list"
          >
            <PanelLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="hidden shrink-0 lg:inline-flex" asChild>
            <Link to={playgroundPath('cards', projectId, `/${cardId}`)} aria-label="Back to card">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{card.displayName}</p>
            {activeChat && <p className="truncate text-xs text-muted-foreground">{activeChat.title}</p>}
          </div>
        </div>

        {activeChat && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Select value={activeChat.mode} onValueChange={(v: ChatMode) => setMode(activeChat.id, v)}>
              <SelectTrigger className="hidden h-8 w-32 text-xs lg:flex">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="roleplay">Roleplay</SelectItem>
                <SelectItem value="interview">Interview</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={activeChat.personaId ?? 'none'}
              onValueChange={(v) => setPersonaId(activeChat.id, v === 'none' ? null : v)}
            >
              <SelectTrigger className="hidden h-8 w-32 text-xs lg:flex">
                <SelectValue placeholder="You" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">You</SelectItem>
                {personas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {presets.length > 0 && (
              <Select
                value={activeChat.aiPresetId ?? presetForFeature(presets, 'chat', featurePresets)?.id ?? ''}
                onValueChange={(v) => setPresetId(activeChat.id, v)}
              >
                <SelectTrigger className="hidden h-8 w-36 text-xs lg:flex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileSettingsOpen(true)}
              aria-label="Chat settings"
            >
              <Settings2 className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" asChild aria-label="Manage lorebooks">
              <Link to={playgroundPath('lorebooks', projectId)}>
                <BookMarked className="size-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setContextOpen(true)}
              aria-label="What the model sees"
            >
              <Eye className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPersonaManagerOpen(true)}
              aria-label="Manage personas"
            >
              <UserRound className="size-4" />
            </Button>
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {wideEnoughForSidebar && (
          <aside className="w-60 shrink-0 overflow-y-auto border-r border-border">
            {chatListContent}
          </aside>
        )}

        <Sheet
          open={!wideEnoughForSidebar && mobileListOpen}
          onOpenChange={setMobileListOpen}
        >
          <SheetContent side="left" className="w-72 max-w-[85vw] p-0">
            <VisuallyHidden>
              <SheetHeader>
                <SheetTitle>Chats</SheetTitle>
              </SheetHeader>
            </VisuallyHidden>
            {chatListContent}
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          {!activeChat ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                icon={MessageSquarePlus}
                title={`Start a chat with ${card.displayName}`}
                description="Chat in character, or switch to interview mode to develop them out of character."
                action={
                  <Button onClick={handleNewChat}>
                    <MessageSquarePlus /> New chat
                  </Button>
                }
                className="max-w-md border-none bg-transparent"
              />
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
                {activeChat.messages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Say something to start the conversation.
                  </p>
                ) : (
                  activeChat.messages.map((message, index) => {
                    // The in-flight placeholder for a streaming reply is rendered separately
                    // below (driven by the hook's live `output`), so skip it here.
                    if (message.id === pendingMessageId) return null
                    return (
                      <ChatMessageBubble
                        key={message.id}
                        message={message}
                        characterName={card.displayName}
                        personaName={personaName}
                        onEdit={(content) => editMessage(activeChat.id, message.id, content)}
                        onDelete={() => deleteMessage(activeChat.id, message.id)}
                        onRegenerate={
                          message.role === 'assistant' && preset && provider
                            ? async () => {
                                await addSwipe(activeChat.id, message.id, '')
                                await runGeneration(
                                  activeChat.id,
                                  activeChat.messages.slice(0, index),
                                  message.id,
                                )
                              }
                            : undefined
                        }
                        onSwipe={
                          message.role === 'assistant'
                            ? (direction) => setActiveSwipe(activeChat.id, message.id, message.activeSwipe + direction)
                            : undefined
                        }
                        onKeep={() =>
                          setKeeping(message.swipes[message.activeSwipe] ?? message.content)
                        }
                      />
                    )
                  })
                )}
                {pendingMessageId && streaming && (
                  <ChatMessageBubble
                    key={`${pendingMessageId}-streaming`}
                    message={{
                      id: pendingMessageId,
                      role: 'assistant',
                      content: '',
                      createdAt: 0,
                      swipes: [output],
                      activeSwipe: 0,
                    }}
                    characterName={card.displayName}
                    personaName={personaName}
                    streaming
                    onEdit={() => {}}
                    onDelete={() => {}}
                  />
                )}
                {streaming && attempt > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Connection dropped — trying again ({attempt} of 2)…
                  </p>
                )}
                {failure && <AiFailureNotice failure={failure} onRetry={retryLastSend} />}
              </div>

              <div className="border-t border-border p-3 sm:p-4">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    placeholder={`Message ${card.displayName}…`}
                    rows={2}
                    className="min-h-0 flex-1 resize-none"
                  />
                  {streaming ? (
                    // Mid-sentence is exactly when a reply turns out to be
                    // going the wrong way, and whatever arrived before the
                    // stop is kept rather than thrown away.
                    <Button size="icon" variant="outline" onClick={stop} aria-label="Stop generating">
                      <Square className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      onClick={handleSend}
                      disabled={!text.trim()}
                      aria-label="Send message"
                    >
                      <Send className="size-4" />
                    </Button>
                  )}
                </div>
                {!provider && (
                  // Offered here, in the place the writer already is, rather
                  // than as a link to a settings page they have to find their
                  // way back from. This is the moment they want it.
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-accent/30 px-3 py-2">
                    <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                      No AI connected — your messages are saved, but {card?.displayName ?? 'they'} can't
                      answer yet. It takes about a minute and works with any provider.
                    </p>
                    <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setConnectOpen(true)}>
                      <PlugZap className="size-3.5" /> Connect an AI
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <ProviderFormDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onSubmit={async (input) => {
          await createProvider(input)
          toast({ title: 'Connected', description: `${card?.displayName ?? 'Your characters'} can reply now.` })
        }}
      />

      {activeChat && (
        <Sheet open={mobileSettingsOpen} onOpenChange={setMobileSettingsOpen}>
          <SheetContent side="bottom" className="lg:hidden">
            <SheetHeader>
              <SheetTitle>Chat settings</SheetTitle>
            </SheetHeader>
            <div className="mt-4 grid gap-4">
              <div className="grid gap-1.5">
                <Label>Mode</Label>
                <Select value={activeChat.mode} onValueChange={(v: ChatMode) => setMode(activeChat.id, v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="roleplay">Roleplay</SelectItem>
                    <SelectItem value="interview">Interview</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Persona</Label>
                <Select
                  value={activeChat.personaId ?? 'none'}
                  onValueChange={(v) => setPersonaId(activeChat.id, v === 'none' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="You" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">You</SelectItem>
                    {personas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {presets.length > 0 && (
                <div className="grid gap-1.5">
                  <Label>AI preset</Label>
                  <Select
                    value={activeChat.aiPresetId ?? presetForFeature(presets, 'chat', featurePresets)?.id ?? ''}
                    onValueChange={(v) => setPresetId(activeChat.id, v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {presets.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      <PersonaManagerDialog open={personaManagerOpen} onOpenChange={setPersonaManagerOpen} />

      <SaveLineDialog
        open={keeping !== null}
        onOpenChange={(open) => !open && setKeeping(null)}
        projectId={projectId}
        speaker={card.displayName}
        text={keeping ?? ''}
        linkedEntryId={card.codexEntryId}
      />

      {/*
        Built only while the drawer is open. It is a read-only answer to a
        question, not something every keystroke needs to recompute — and the
        answer has to be for the *next* send, so it is assembled from the
        conversation exactly as it stands.
      */}
      <Sheet open={contextOpen} onOpenChange={setContextOpen}>
        <SheetContent side="right" className="w-full max-w-md space-y-4 sm:w-[28rem]">
          <SheetHeader>
            <SheetTitle>What {card.displayName} sees</SheetTitle>
          </SheetHeader>
          {contextOpen && preset && (
            <ContextPreview
              plan={
                buildChatPrompt({
                  card,
                  chat: activeChat,
                  persona,
                  lorebooks,
                  preset,
                  history: activeChat.messages,
                }).plan
              }
            />
          )}
          {!preset && (
            <p className="text-sm text-muted-foreground">
              Add an AI preset in Settings → AI and this will show exactly what gets sent.
            </p>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDeleteDialog
        open={deletingChatId !== null}
        onOpenChange={(open) => !open && setDeletingChatId(null)}
        title="Delete this chat?"
        description="This permanently deletes the conversation. This can't be undone."
        onConfirm={async () => {
          if (!deletingChatId) return
          const wasOpen = deletingChatId === chatId
          await deleteChat(deletingChatId)
          setDeletingChatId(null)
          // Deleting the conversation you are reading leaves the URL pointing
          // at nothing; move to a sibling, or out to the list if that was the
          // last one.
          if (wasOpen) {
            const sibling = useChatStore.getState().chats.find((c) => c.cardId === cardId)
            navigate(
              sibling
                ? playgroundPath('chats', projectId, `/${sibling.id}`)
                : playgroundPath('chats', projectId),
              { replace: true },
            )
          }
        }}
      />
    </div>
  )
}
