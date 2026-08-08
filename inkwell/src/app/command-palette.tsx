import {
  Feather,
  FileSearch,
  FilePlus,
  Keyboard,
  Library,
  Maximize2,
  Search,
  SunMoon,
  TextQuote,
  UserRound,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { DESTINATIONS } from '@/app/layout/nav-items'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { VisuallyHidden } from '@/components/common/visually-hidden'
import { ENTRY_TYPE_ICON } from '@/features/codex/lib/entry-type'
import { searchProse } from '@/lib/search/prose-search'
import { matchesShortcut } from '@/lib/shortcuts'
import { useCardStore } from '@/stores/card-store'
import { useCodexStore } from '@/stores/codex-store'
import { useEditorStore } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { useUiStore } from '@/stores/ui-store'

interface PaletteEntry {
  id: string
  section: 'Actions' | 'Scenes' | 'In the prose' | 'Almanac' | 'Characters' | 'Projects' | 'Navigate'
  label: string
  hint?: string
  icon: React.ComponentType<{ className?: string }>
  run: () => void
}

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen)
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const focusMode = useUiStore((s) => s.focusMode)
  const setFocusMode = useUiStore((s) => s.setFocusMode)
  const setManuscriptSearchOpen = useUiStore((s) => s.setManuscriptSearchOpen)
  const requestFindInScene = useUiStore((s) => s.requestFindInScene)

  const navigate = useNavigate()
  const location = useLocation()
  const { setTheme, theme } = useTheme()

  const projects = useProjectStore((s) => s.projects)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const projectStoreStatus = useProjectStore((s) => s.status)

  const editorProjectId = useEditorStore((s) => s.projectId)
  const scenes = useEditorStore((s) => s.scenes)
  const chapters = useEditorStore((s) => s.chapters)
  const setActiveScene = useEditorStore((s) => s.setActiveScene)
  const createChapter = useEditorStore((s) => s.createChapter)

  const codexEntries = useCodexStore((s) => s.entries)
  const codexProjectId = useCodexStore((s) => s.projectId)

  const cards = useCardStore((s) => s.cards)
  const cardProjectId = useCardStore((s) => s.projectId)
  const loadCards = useCardStore((s) => s.loadProject)

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (matchesShortcut(e, 'command-palette')) {
        e.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, setOpen])

  useEffect(() => {
    if (open && projectStoreStatus === 'idle') fetchProjects()
  }, [open, projectStoreStatus, fetchProjects])

  // Characters live in their own store, loaded on demand by the Playground.
  // The palette is allowed to want them first.
  useEffect(() => {
    if (open && editorProjectId && cardProjectId !== editorProjectId) loadCards(editorProjectId)
  }, [open, editorProjectId, cardProjectId, loadCards])

  // Reset the query/selection each time the palette opens, adjusted during render
  // (React's recommended pattern) rather than via an effect.
  const [renderedOpen, setRenderedOpen] = useState(open)
  if (open !== renderedOpen) {
    setRenderedOpen(open)
    if (open) {
      setQuery('')
      setSelectedIndex(0)
    }
  }

  const chapterTitleById = useMemo(() => new Map(chapters.map((c) => [c.id, c.title])), [chapters])

  const entries = useMemo<PaletteEntry[]>(() => {
    const list: PaletteEntry[] = []

    list.push({
      id: 'action-theme',
      section: 'Actions',
      label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
      icon: SunMoon,
      run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    })

    list.push({
      id: 'action-shortcuts',
      section: 'Actions',
      label: 'Keyboard shortcuts',
      icon: Keyboard,
      run: () => navigate('/settings?tab=shortcuts'),
    })

    if (location.pathname.startsWith('/editor') && editorProjectId) {
      list.push({
        id: 'action-focus',
        section: 'Actions',
        label: focusMode ? 'Exit focus mode' : 'Enter focus mode',
        icon: Maximize2,
        run: () => setFocusMode(!focusMode),
      })
      list.push({
        id: 'action-search',
        section: 'Actions',
        label: 'Search manuscript…',
        icon: FileSearch,
        run: () => setManuscriptSearchOpen(true),
      })
      list.push({
        id: 'action-new-chapter',
        section: 'Actions',
        label: 'New chapter',
        icon: FilePlus,
        run: () => createChapter(),
      })
    }

    if (editorProjectId) {
      for (const scene of scenes) {
        list.push({
          id: `scene-${scene.id}`,
          section: 'Scenes',
          label: scene.title,
          hint: chapterTitleById.get(scene.chapterId),
          icon: Feather,
          run: () => {
            setActiveScene(scene.id)
            navigate(`/editor?project=${editorProjectId}`)
          },
        })
      }
    }

    if (codexProjectId) {
      for (const entry of codexEntries) {
        list.push({
          id: `codex-${entry.id}`,
          section: 'Almanac',
          label: entry.name,
          hint: entry.aliases[0],
          icon: ENTRY_TYPE_ICON[entry.type],
          run: () => navigate(`/almanac/${entry.id}?project=${codexProjectId}`),
        })
      }
    }

    if (editorProjectId && cardProjectId === editorProjectId) {
      for (const card of cards) {
        list.push({
          id: `card-${card.id}`,
          section: 'Characters',
          label: card.displayName,
          hint: card.tags[0],
          icon: UserRound,
          run: () => navigate(`/playground/cards/${card.id}?project=${editorProjectId}`),
        })
      }
    }

    for (const project of projects) {
      list.push({
        id: `project-${project.id}`,
        section: 'Projects',
        label: project.title,
        hint: project.author || undefined,
        icon: Library,
        run: () => navigate(`/editor?project=${project.id}`),
      })
    }

    for (const nav of DESTINATIONS) {
      // The rail carries the open book from screen to screen; jumping by ⌘K
      // should not be the one route that quietly drops it and lands the
      // writer on an empty Almanac.
      const to = nav.projectScoped && editorProjectId ? `${nav.to}?project=${editorProjectId}` : nav.to
      list.push({
        id: `nav-${nav.to}`,
        section: 'Navigate',
        label: nav.label,
        icon: nav.icon,
        run: () => navigate(to),
      })
    }

    return list
  }, [
    theme,
    setTheme,
    location.pathname,
    editorProjectId,
    focusMode,
    setFocusMode,
    setManuscriptSearchOpen,
    createChapter,
    scenes,
    chapterTitleById,
    setActiveScene,
    navigate,
    projects,
    codexEntries,
    codexProjectId,
    cards,
    cardProjectId,
  ])

  /**
   * The book's own words as results. Only the open project's scenes are in
   * memory, so that's the honest search scope; selecting one hands the query
   * to the editor's find bar so the match arrives already highlighted.
   */
  const proseEntries = useMemo<PaletteEntry[]>(() => {
    if (!editorProjectId) return []
    return searchProse(scenes, query).map((match) => ({
      id: `prose-${match.sceneId}`,
      section: 'In the prose',
      label: match.snippet,
      hint: match.sceneTitle,
      icon: TextQuote,
      run: () => {
        setActiveScene(match.sceneId)
        requestFindInScene(match.sceneId, query.trim())
        navigate(`/editor?project=${editorProjectId}`)
      },
    }))
  }, [editorProjectId, scenes, query, setActiveScene, requestFindInScene, navigate])

  const filtered = useMemo(() => {
    if (!query.trim()) return entries
    const q = query.toLowerCase()
    const named = entries.filter(
      (e) => e.label.toLowerCase().includes(q) || e.hint?.toLowerCase().includes(q),
    )
    return [...named, ...proseEntries]
  }, [entries, proseEntries, query])

  const grouped = useMemo(() => {
    const sections: PaletteEntry['section'][] = [
      'Actions',
      'Scenes',
      'In the prose',
      'Almanac',
      'Characters',
      'Projects',
      'Navigate',
    ]
    return sections
      .map((section) => ({ section, items: filtered.filter((e) => e.section === section) }))
      .filter((g) => g.items.length > 0)
  }, [filtered])

  // Selection walks the list as *displayed* — grouped by section — which is
  // not the order `filtered` was assembled in once prose results joined it.
  const flatList = useMemo(() => grouped.flatMap((g) => g.items), [grouped])

  function runEntry(entry: PaletteEntry) {
    entry.run()
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, flatList.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const entry = flatList[selectedIndex]
      if (entry) runEntry(entry)
    }
  }

  let flatIndex = -1

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg gap-0 p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <VisuallyHidden>
          <DialogTitle>Command palette</DialogTitle>
        </VisuallyHidden>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search your book, or jump to a scene, project, or action…"
            className="h-12 border-none px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {grouped.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No results</p>
          ) : (
            grouped.map((group) => (
              <div key={group.section} className="mb-1 last:mb-0">
                <p className="px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.section}
                </p>
                {group.items.map((entry) => {
                  flatIndex++
                  const isSelected = flatIndex === selectedIndex
                  const Icon = entry.icon
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onMouseEnter={() => setSelectedIndex(flatIndex)}
                      onClick={() => runEntry(entry)}
                      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ${
                        isSelected ? 'bg-accent text-accent-foreground' : ''
                      }`}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                      {entry.hint && (
                        <span className="shrink-0 truncate text-xs text-muted-foreground">
                          {entry.hint}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
