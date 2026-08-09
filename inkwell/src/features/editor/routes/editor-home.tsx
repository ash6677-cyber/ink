import type { Editor } from '@tiptap/react'
import {
  AlertTriangle,
  Library,
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelRight,
  Search,
  Settings2,
  Sparkles,
  SpellCheck,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { VisuallyHidden } from '@/components/common/visually-hidden'
import { AiAssistantPanel } from '@/features/editor/components/ai-assistant-panel'
import { ProofreadPanel } from '@/features/editor/components/proofread-panel'
import { ReadAloudButton } from '@/features/editor/components/read-aloud-button'
import { ChapterSceneTree } from '@/features/editor/components/chapter-scene-tree'
import { FindInScene } from '@/features/editor/components/find-in-scene'
import { ManuscriptSearchPanel } from '@/features/editor/components/manuscript-search-panel'
import { SceneEditor } from '@/features/editor/components/scene-editor'
import { SceneMetadataDrawer } from '@/features/editor/components/scene-metadata-drawer'
import { SprintControl } from '@/features/editor/components/sprint-control'
import { WordGoalControl } from '@/features/editor/components/word-goal-control'
import { HandoffBanner } from '@/features/book-creator/components/handoff-banner'
import { useDebouncedCallback } from '@/lib/hooks/use-debounced-callback'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { projectRepo, snapshotRepo } from '@/lib/db/repositories'
import { formatWordCount } from '@/lib/format'
import { matchesShortcut } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { useAiStore } from '@/stores/ai-store'
import { useCodexStore } from '@/stores/codex-store'
import { useEditorStore } from '@/stores/editor-store'
import { usePreferencesStore } from '@/stores/preferences-store'
import { dailyTotals, useStatsStore, wordsToday } from '@/stores/stats-store'
import { type PendingFind, useUiStore } from '@/stores/ui-store'
import type { Project, RichContent } from '@/types'
import { useDocumentTitle } from '@/lib/hooks/use-document-title'

type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'failed'
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000

export function EditorHome() {
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('project')

  const [project, setProject] = useState<Project | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    const lookup = projectId ? projectRepo.get(projectId) : Promise.resolve(undefined)
    lookup.then((found) => {
      if (!cancelled) setProject(found ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const status = useEditorStore((s) => s.status)
  const chapters = useEditorStore((s) => s.chapters)
  const scenes = useEditorStore((s) => s.scenes)
  const activeSceneId = useEditorStore((s) => s.activeSceneId)
  const setActiveScene = useEditorStore((s) => s.setActiveScene)
  const loadProject = useEditorStore((s) => s.loadProject)
  const updateSceneContent = useEditorStore((s) => s.updateSceneContent)

  useEffect(() => {
    if (projectId) loadProject(projectId)
  }, [projectId, loadProject])

  // A `?scene=` in the link opens straight to that scene, which is what makes
  // "appears in" in the Almanac worth clicking. Applied once the manuscript
  // has loaded and only if the scene really belongs to it, so a stale link
  // lands on the book rather than on nothing.
  const requestedSceneId = searchParams.get('scene')
  useEffect(() => {
    if (!requestedSceneId || status !== 'ready') return
    if (scenes.some((scene) => scene.id === requestedSceneId)) setActiveScene(requestedSceneId)
  }, [requestedSceneId, status, scenes, setActiveScene])

  const codexEntries = useCodexStore((s) => s.entries)
  const loadCodexProject = useCodexStore((s) => s.loadProject)
  useEffect(() => {
    if (projectId) loadCodexProject(projectId)
  }, [projectId, loadCodexProject])

  const aiStoreStatus = useAiStore((s) => s.status)
  const loadAiStore = useAiStore((s) => s.loadAll)
  useEffect(() => {
    if (aiStoreStatus === 'idle') loadAiStore()
  }, [aiStoreStatus, loadAiStore])

  const focusMode = useUiStore((s) => s.focusMode)
  const setFocusMode = useUiStore((s) => s.setFocusMode)
  const typewriterMode = usePreferencesStore((s) => s.typewriterMode)
  const setTypewriterMode = usePreferencesStore((s) => s.setTypewriterMode)
  const dimInactiveParagraphs = usePreferencesStore((s) => s.dimInactiveParagraphs)
  const setDimInactiveParagraphs = usePreferencesStore((s) => s.setDimInactiveParagraphs)
  const manuscriptSearchOpen = useUiStore((s) => s.manuscriptSearchOpen)
  const setManuscriptSearchOpen = useUiStore((s) => s.setManuscriptSearchOpen)

  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [showMetadata, setShowMetadata] = useState(true)
  const [mobileMetadataOpen, setMobileMetadataOpen] = useState(false)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [proofreadOpen, setProofreadOpen] = useState(false)
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false)
  const metadataVisible = isDesktop ? showMetadata : mobileMetadataOpen
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findSeed, setFindSeed] = useState(0)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  /** When the last successful write landed, so "Saved" can say when. */
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [editorEpoch, setEditorEpoch] = useState(0)
  const [snapshotVersion, setSnapshotVersion] = useState(0)
  const [liveEditor, setLiveEditor] = useState<Editor | null>(null)
  const lastSnapshotAtRef = useRef<Map<string, number>>(new Map())

  const activeScene = useMemo(
    () => scenes.find((s) => s.id === activeSceneId) ?? null,
    [scenes, activeSceneId],
  )
  const activeChapter = useMemo(
    () => (activeScene ? chapters.find((c) => c.id === activeScene.chapterId) : null),
    [chapters, activeScene],
  )
  useDocumentTitle(activeScene?.title, 'Editor')

  const bookWordCount = useMemo(() => scenes.reduce((sum, s) => sum + s.wordCount, 0), [scenes])
  const savedTimeLabel = useMemo(
    () =>
      savedAt === null
        ? 'Saved'
        : `Saved · ${new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    [savedAt],
  )
  const structureMode = project?.settings.structureMode ?? 'scenes'

  // Reset the save-status pill when the active scene changes, via render-time adjustment
  // rather than an effect (React's recommended pattern for this).
  const [renderedActiveSceneId, setRenderedActiveSceneId] = useState(activeSceneId)
  if (activeSceneId !== renderedActiveSceneId) {
    setRenderedActiveSceneId(activeSceneId)
    setSaveStatus('idle')
    setMobileTreeOpen(false)
  }

  function openFind(query = '') {
    setFindQuery(query)
    setFindSeed((s) => s + 1)
    setFindOpen(true)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (matchesShortcut(e, 'toggle-focus-mode')) {
        e.preventDefault()
        setFocusMode(!focusMode)
        return
      }
      // Escape leaves focus mode, because Escape leaves every full-screen
      // mode ever shipped and a writer should not have to learn otherwise.
      // But only when nothing closer owns the key: the find bar closes
      // itself and calls preventDefault (checking `findOpen` here is not
      // enough — closing it re-renders mid-bubble, and the re-registered
      // listener would see it already false), and anything inside a menu,
      // dialog, or popover is Radix's Escape, not ours.
      if (focusMode && e.key === 'Escape' && !e.defaultPrevented && !findOpen) {
        const target = e.target as HTMLElement | null
        const inOverlay = target?.closest(
          '[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]',
        )
        if (!inOverlay) {
          setFocusMode(false)
          return
        }
      }
      if (!activeScene) return
      if (matchesShortcut(e, 'search-manuscript')) {
        e.preventDefault()
        setManuscriptSearchOpen(true)
      } else if (matchesShortcut(e, 'find-in-scene')) {
        e.preventDefault()
        openFind()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeScene, setManuscriptSearchOpen, focusMode, setFocusMode, findOpen])

  // A prose result chosen in the command palette arrives here as a pending
  // find: once the right scene is active and its editor exists, the find bar
  // opens with the query already highlighted. Waiting on `liveEditor` is what
  // makes this work from any route — the palette may have navigated from
  // Projects, a whole mount earlier. Adjusted during render (the codebase's
  // usual pattern); only the store cleanup lives in an effect.
  const pendingFind = useUiStore((s) => s.pendingFind)
  const clearPendingFind = useUiStore((s) => s.clearPendingFind)
  const [handledFind, setHandledFind] = useState<PendingFind | null>(null)
  if (pendingFind && pendingFind !== handledFind && liveEditor && activeSceneId === pendingFind.sceneId) {
    setHandledFind(pendingFind)
    setFindQuery(pendingFind.query)
    setFindSeed((s) => s + 1)
    setFindOpen(true)
  }
  useEffect(() => {
    if (pendingFind && pendingFind === handledFind) clearPendingFind()
  }, [pendingFind, handledFind, clearPendingFind])

  // Entering focus mode should land the caret back in the prose. The writer
  // pressed a button that says "just let me write"; making them click the
  // page afterwards is the app not believing them.
  useEffect(() => {
    if (!focusMode) return
    const raf = requestAnimationFrame(() => liveEditor?.commands.focus())
    return () => cancelAnimationFrame(raf)
  }, [focusMode, liveEditor])

  // The focus HUD shows itself when the hand is on the mouse and gets out of
  // the way when the hands are on the keys. A half-dimmed pill hovering over
  // the prose was the worst of both: present enough to collide with scrolled
  // text, absent enough to look broken.
  const [hudVisible, setHudVisible] = useState(true)
  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [focusSettingsOpen, setFocusSettingsOpen] = useState(false)
  useEffect(() => {
    if (!focusMode) return
    const wake = () => {
      setHudVisible(true)
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current)
      hudTimerRef.current = setTimeout(() => setHudVisible(false), 2500)
    }
    // Visible on entry, so the writer sees where the exit lives before it
    // hides itself. Waking on pointerdown as well as movement is what makes
    // this work on a touchscreen: a thumb never moves a cursor, but a tap
    // anywhere should still summon the controls.
    wake()
    window.addEventListener('pointermove', wake)
    window.addEventListener('pointerdown', wake)
    return () => {
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('pointerdown', wake)
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current)
    }
  }, [focusMode])

  // Today's words for the focus pill — loaded lazily, only once focus mode
  // actually asks for them.
  const statsStatus = useStatsStore((s) => s.status)
  const statsSessions = useStatsStore((s) => s.sessions)
  const loadStats = useStatsStore((s) => s.loadAll)
  useEffect(() => {
    if (focusMode && statsStatus === 'idle') loadStats()
  }, [focusMode, statsStatus, loadStats])
  const todayWords = useMemo(
    () => (projectId ? wordsToday(dailyTotals(statsSessions, 1, projectId)) : 0),
    [statsSessions, projectId],
  )

  // Reads the scene fresh from the store at call time (via getState) rather than closing
  // over the `activeScene` from render — this fires after a debounce delay, so a closure
  // would go stale after the first edit and never see subsequent content.
  const doPersist = useCallback(
    async (
      sceneId: string,
      input: { content: RichContent; plainText: string; wordCount: number },
    ) => {
      setSaveStatus('saving')
      const currentScene = useEditorStore.getState().scenes.find((s) => s.id === sceneId)
      if (!currentScene) return
      const lastSnapshot = lastSnapshotAtRef.current.get(sceneId) ?? 0
      if (
        Date.now() - lastSnapshot > SNAPSHOT_INTERVAL_MS &&
        currentScene.plainText.trim().length > 0
      ) {
        await snapshotRepo.create({
          sceneId,
          content: currentScene.content,
          plainText: currentScene.plainText,
          wordCount: currentScene.wordCount,
          label: 'Autosave',
        })
        lastSnapshotAtRef.current.set(sceneId, Date.now())
        setSnapshotVersion((v) => v + 1)
      }
      try {
        await updateSceneContent(sceneId, input)
        setSavedAt(Date.now())
        setSaveStatus('saved')
      } catch {
        // The one anxiety a local-first app has to answer is "is my work
        // safe?". Swallowing a failed write and continuing to look calm is
        // the worst possible answer, so this says so and keeps saying so.
        setSaveStatus('failed')
      }
    },
    [updateSceneContent],
  )

  // Serialisation happens here — once per save — not once per keystroke.
  // getJSON/getText walk the whole document, which is fine at 800 words and
  // a dropped frame per key at 20,000; the debounce already meant nothing
  // read the serialised value until now anyway. The refs pair the live
  // editor with the scene it belongs to, so a save that fires after a scene
  // switch can never write one scene's words under another's id.
  const liveEditorRef = useRef<{ editor: Editor; sceneId: string } | null>(null)
  const pendingSceneIdRef = useRef<string | null>(null)

  const serializeLive = (sceneId: string) => {
    const live = liveEditorRef.current
    if (!live || live.sceneId !== sceneId || live.editor.isDestroyed) return null
    return {
      content: live.editor.getJSON(),
      plainText: live.editor.getText(),
      wordCount: live.editor.storage.characterCount.words() as number,
    }
  }

  const persistChange = useCallback(
    (sceneId: string) => {
      if (pendingSceneIdRef.current !== sceneId) return
      const input = serializeLive(sceneId)
      if (!input) return
      pendingSceneIdRef.current = null
      void doPersist(sceneId, input)
    },
    [doPersist],
  )

  const autosaveDelayMs = usePreferencesStore((s) => s.autosaveDelayMs)
  const debouncedPersist = useDebouncedCallback(persistChange, autosaveDelayMs)

  function handleEditorChange() {
    if (!activeScene) return
    setSaveStatus('unsaved')
    pendingSceneIdRef.current = activeScene.id
    debouncedPersist(activeScene.id)
  }

  // The moment a SceneEditor unmounts it announces itself with null — while
  // its editor is still alive, one statement before destroy(). That is the
  // window in which an edit younger than the debounce gets serialised and
  // saved, so switching scenes mid-sentence never costs the sentence.
  function attachEditor(editor: Editor | null, sceneId: string) {
    if (editor) {
      liveEditorRef.current = { editor, sceneId }
      setLiveEditor(editor)
      return
    }
    if (pendingSceneIdRef.current === sceneId) {
      const input = serializeLive(sceneId)
      if (input) {
        pendingSceneIdRef.current = null
        void doPersist(sceneId, input)
      }
    }
    if (liveEditorRef.current?.sceneId === sceneId) liveEditorRef.current = null
    setLiveEditor(null)
  }

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={Library}
          title="No project selected"
          description="Open a project from the Projects page to start writing."
          action={
            <Button asChild>
              <Link to="/projects">Go to Projects</Link>
            </Button>
          }
        />
      </div>
    )
  }

  if (project === undefined || (status === 'loading' && chapters.length === 0)) {
    return (
      <div className="flex h-full">
        <div className="hidden w-72 shrink-0 space-y-2 border-r border-border p-3 lg:block">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-5/6" />
        </div>
        <div className="flex-1 p-6 sm:p-10">
          <Skeleton className="mx-auto h-96 max-w-2xl" />
        </div>
      </div>
    )
  }

  if (project === null) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={Library}
          title="Project not found"
          description="This project may have been deleted. Head back to Projects to pick another."
          action={
            <Button asChild>
              <Link to="/projects">Go to Projects</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/*
        One tree, in whichever container the screen calls for.
        It used to be written twice — a sidebar hidden below `lg` and a Sheet
        above it. `hidden` is a CSS word, not a React one, so on a phone the
        sidebar copy was still mounted, still running its live queries and
        drag sensors, for a panel nobody could see. Rendering by measurement
        rather than by class means exactly one exists at a time.
      */}
      {!focusMode && isDesktop && (
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-border py-2">
          <ChapterSceneTree structureMode={structureMode} />
        </aside>
      )}

      {!focusMode && !isDesktop && (
        <Sheet open={mobileTreeOpen} onOpenChange={setMobileTreeOpen}>
          <SheetContent side="left" className="w-80 max-w-[85vw] p-0">
            <VisuallyHidden>
              <SheetHeader>
                <SheetTitle>Manuscript</SheetTitle>
              </SheetHeader>
            </VisuallyHidden>
            <div className="flex h-14 items-center border-b border-border px-4">
              <p className="truncate text-sm font-medium">{project.title}</p>
            </div>
            <div className="overflow-y-auto py-2">
              <ChapterSceneTree structureMode={structureMode} />
            </div>
          </SheetContent>
        </Sheet>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {focusMode ? (
          // Fully there or fully gone, never a ghost: when hidden it also
          // stops catching the pointer, so nothing invisible ever sits
          // between the writer and their own text. A failed save and an open
          // settings menu both pin it visible — one because it must be seen,
          // the other because a menu whose anchor fades away looks haunted.
          <div
            className={cn(
              'fixed right-5 top-4 z-10 flex items-center gap-2 rounded-full border border-border/60 bg-card/90 px-3 py-1.5 shadow-sm backdrop-blur transition-opacity duration-200 hover:opacity-100 focus-within:opacity-100',
              hudVisible || focusSettingsOpen || saveStatus === 'failed'
                ? 'opacity-100'
                : 'pointer-events-none opacity-0',
            )}
          >
            <span className="text-xs tabular-nums text-muted-foreground" title="Every word in this book">
              {formatWordCount(bookWordCount)} words
            </span>
            {todayWords > 0 && (
              <span
                className="border-l border-border/60 pl-2 text-xs tabular-nums text-muted-foreground"
                title="Written today"
              >
                +{formatWordCount(todayWords)} today
              </span>
            )}
            {saveStatus === 'failed' ? (
              <span
                role="alert"
                className="flex items-center gap-1 border-l border-border/60 pl-2 text-xs font-medium text-destructive"
              >
                <AlertTriangle className="size-3.5" /> Could not save — your text is still here
              </span>
            ) : saveStatus === 'saving' || saveStatus === 'saved' ? (
              <span className="border-l border-border/60 pl-2 text-xs text-muted-foreground/70">
                {saveStatus === 'saving' ? 'Saving…' : savedTimeLabel}
              </span>
            ) : null}
            <DropdownMenu open={focusSettingsOpen} onOpenChange={setFocusSettingsOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label="Focus mode settings"
                    >
                      <Settings2 className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Focus mode settings</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuCheckboxItem
                  checked={typewriterMode}
                  onCheckedChange={setTypewriterMode}
                >
                  Typewriter scrolling
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={dimInactiveParagraphs}
                  onCheckedChange={setDimInactiveParagraphs}
                >
                  Dim other paragraphs
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => setFocusMode(false)}
                  aria-label="Exit focus mode"
                >
                  <Minimize2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Exit focus mode (Esc)</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 lg:hidden"
                onClick={() => setMobileTreeOpen(true)}
                aria-label="Open manuscript tree"
              >
                <PanelLeft className="size-4" />
              </Button>
              {activeScene && structureMode === 'chapters-only' ? (
                <p className="truncate text-sm font-medium">
                  {activeChapter?.title ?? project.title}
                </p>
              ) : activeScene ? (
                <p className="truncate text-sm">
                  <span className="text-muted-foreground">
                    {activeChapter?.title ?? project.title}
                  </span>
                  <span className="mx-1.5 text-muted-foreground/50">/</span>
                  <span className="font-medium">{activeScene.title}</span>
                </p>
              ) : (
                <p className="truncate text-sm font-medium">{project.title}</p>
              )}
            </div>

            <div className="flex items-center gap-1">
              <span
                className="mr-2 hidden text-xs text-muted-foreground sm:inline"
                title="Every word in this book"
              >
                {formatWordCount(bookWordCount)} words in this book
              </span>
              <WordGoalControl projectId={projectId ?? ''} />
              <SprintControl bookWordCount={bookWordCount} />
              {activeScene && saveStatus === 'failed' && (
                <span
                  role="alert"
                  className="mr-1 flex items-center gap-1 text-xs font-medium text-destructive"
                >
                  <AlertTriangle className="size-3.5" /> Could not save — your text is still here
                </span>
              )}
              {activeScene && saveStatus !== 'failed' && (
                <span
                  className={cn(
                    'mr-1 hidden text-xs sm:inline',
                    saveStatus === 'unsaved' ? 'text-muted-foreground' : 'text-muted-foreground/70',
                  )}
                >
                  {saveStatus === 'saving'
                    ? 'Saving…'
                    : saveStatus === 'unsaved'
                      ? 'Unsaved changes'
                      : saveStatus === 'saved'
                        ? // The time is the point. "Saved" alone is a claim;
                          // "Saved · 12:04" is something a writer can check
                          // against the clock and their own last keystroke.
                          savedTimeLabel
                        : ''}
                </span>
              )}

              {activeScene && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={findOpen ? 'secondary' : 'ghost'}
                      size="icon"
                      onClick={() => (findOpen ? setFindOpen(false) : openFind())}
                      aria-label="Find in scene"
                    >
                      <Search className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Find in scene (Ctrl+F)</TooltipContent>
                </Tooltip>
              )}

              {activeScene && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={aiPanelOpen ? 'secondary' : 'ghost'}
                      size="icon"
                      onClick={() => setAiPanelOpen((v) => !v)}
                      aria-label="AI assistant"
                    >
                      <Sparkles className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>AI assistant</TooltipContent>
                </Tooltip>
              )}

              {activeScene && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={proofreadOpen ? 'secondary' : 'ghost'}
                      size="icon"
                      onClick={() => setProofreadOpen(true)}
                      aria-label="Proofread scene"
                    >
                      <SpellCheck className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Proofread scene</TooltipContent>
                </Tooltip>
              )}

              {activeScene && <ReadAloudButton text={activeScene.plainText} />}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setFocusMode(!focusMode)}
                    aria-label="Enter focus mode"
                  >
                    <Maximize2 className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Focus mode</TooltipContent>
              </Tooltip>

              {activeScene && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={metadataVisible ? 'secondary' : 'ghost'}
                      size="icon"
                      onClick={() =>
                        isDesktop
                          ? setShowMetadata((v) => !v)
                          : setMobileMetadataOpen((v) => !v)
                      }
                      aria-label="Toggle scene details"
                    >
                      <PanelRight className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Scene details</TooltipContent>
                </Tooltip>
              )}
            </div>
          </header>
        )}

        {!focusMode && <HandoffBanner projectId={projectId} />}

        <div className="relative flex-1 overflow-y-auto">
          {activeScene && findOpen && (
            <FindInScene
              key={`${activeScene.id}-${findSeed}`}
              editor={liveEditor}
              initialQuery={findQuery}
              onClose={() => setFindOpen(false)}
            />
          )}
          {activeScene ? (
            <SceneEditor
              key={`${activeScene.id}-${editorEpoch}`}
              sceneId={activeScene.id}
              content={activeScene.content}
              measureWidthCh={project.settings.measureWidthCh}
              focusMode={focusMode}
              projectId={projectId}
              codexEntries={codexEntries}
              onChange={handleEditorChange}
              onEditorInstance={(instance) => attachEditor(instance, activeScene.id)}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                icon={Library}
                title={chapters.length === 0 ? 'Start your manuscript' : 'No scene selected'}
                description={
                  chapters.length === 0
                    ? 'Add a chapter from the manuscript tree to begin.'
                    : 'Select a scene from the manuscript tree, or add a new one.'
                }
              />
            </div>
          )}
        </div>
      </div>

      {!focusMode && aiPanelOpen && activeScene && isDesktop && (
        <aside className="w-96 shrink-0 overflow-y-auto border-l border-border animate-slide-in">
          <AiAssistantPanel
            scene={activeScene}
            editor={liveEditor}
            codexEntries={codexEntries}
            pov={project.settings.pov}
            tense={project.settings.tense}
            onClose={() => setAiPanelOpen(false)}
          />
        </aside>
      )}

      {!focusMode && !aiPanelOpen && showMetadata && activeScene && isDesktop && (
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-border animate-slide-in">
          <SceneMetadataDrawer
            scene={activeScene}
            onClose={() => setShowMetadata(false)}
            onContentRestored={() => setEditorEpoch((e) => e + 1)}
            snapshotVersion={snapshotVersion}
          />
        </aside>
      )}

      {!focusMode && !isDesktop && activeScene && (
        <Sheet
          open={aiPanelOpen}
          onOpenChange={(open) => setAiPanelOpen(open)}
        >
          <SheetContent side="right" className="w-full max-w-md p-0 sm:max-w-sm">
            <VisuallyHidden>
              <SheetHeader>
                <SheetTitle>AI assistant</SheetTitle>
              </SheetHeader>
            </VisuallyHidden>
            <AiAssistantPanel
              scene={activeScene}
              editor={liveEditor}
              codexEntries={codexEntries}
              pov={project.settings.pov}
              tense={project.settings.tense}
              onClose={() => setAiPanelOpen(false)}
            />
          </SheetContent>
        </Sheet>
      )}

      {!focusMode && !isDesktop && activeScene && (
        <Sheet open={mobileMetadataOpen} onOpenChange={setMobileMetadataOpen}>
          <SheetContent side="right" className="w-full max-w-sm p-0">
            <VisuallyHidden>
              <SheetHeader>
                <SheetTitle>Scene details</SheetTitle>
              </SheetHeader>
            </VisuallyHidden>
            <SceneMetadataDrawer
              scene={activeScene}
              onClose={() => setMobileMetadataOpen(false)}
              onContentRestored={() => setEditorEpoch((e) => e + 1)}
              snapshotVersion={snapshotVersion}
            />
          </SheetContent>
        </Sheet>
      )}

      <ManuscriptSearchPanel
        open={manuscriptSearchOpen}
        onOpenChange={setManuscriptSearchOpen}
        onNavigate={(sceneId, query) => {
          setActiveScene(sceneId)
          openFind(query)
        }}
      />

      {activeScene && (
        <ProofreadPanel
          open={proofreadOpen}
          onOpenChange={setProofreadOpen}
          scene={activeScene}
          editor={liveEditor}
        />
      )}
    </div>
  )
}
