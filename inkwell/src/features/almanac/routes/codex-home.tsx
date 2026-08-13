import { BookOpen, BookText, Download, Library, List, Map as MapIcon, Plus, Search, Share2, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { EntryCard } from '@/features/almanac/components/entry-card'
import { EntryFormDialog } from '@/features/almanac/components/entry-form-dialog'
import { AtlasView } from '@/features/almanac/components/atlas-view'
import { RelationshipMap } from '@/features/almanac/components/relationship-map'
import { AlmanacSurvey } from '@/features/almanac/components/almanac-survey'
import { exportAlmanac, importAlmanac } from '@/features/almanac/lib/run-almanac-io'
import { saveExport } from '@/features/export/lib/save-file'
import { chapterRepo, sceneRepo } from '@/lib/db/repositories'
import { useProjectStore } from '@/stores/project-store'
import { useCodexStore } from '@/stores/codex-store'
import type { CodexEntryType } from '@/types'
import { useDocumentTitle } from '@/lib/hooks/use-document-title'

export function CodexHome() {
  useDocumentTitle('Almanac')
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('project')

  const { entries, status, error, loadProject, createEntry } = useCodexStore()
  const { toast } = useToast()
  const projects = useProjectStore((s) => s.projects)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const importFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])

  /**
   * The Almanac as a file — the cast and world of this book, portable.
   * The next book in a series lives in a different project, and what it
   * needs from this one is the people, not the prose.
   */
  async function handleExportAlmanac() {
    if (!projectId) return
    const title = projects.find((p) => p.id === projectId)?.title ?? 'almanac'
    const file = await exportAlmanac(projectId, title)
    await saveExport({
      filename: `${title.replace(/[^\w-]+/g, '-').toLowerCase() || 'almanac'}.almanac.json`,
      mimeType: 'application/json',
      text: JSON.stringify(file, null, 2),
    })
    toast({
      title: `${file.entries.length} ${file.entries.length === 1 ? 'entry' : 'entries'} exported`,
      description: 'Import the file into any other book from its Almanac page.',
    })
  }

  async function handleImportAlmanac(picked: File | undefined) {
    if (!picked || !projectId) return
    const result = await importAlmanac(projectId, await picked.text())
    if ('error' in result) {
      toast({ title: 'Could not import that file', description: result.error, variant: 'destructive' })
      return
    }
    await loadProject(projectId)
    toast({
      title: `${result.created} ${result.created === 1 ? 'entry' : 'entries'} imported`,
      description:
        result.skipped.length > 0
          ? `Left alone because they already exist here: ${result.skipped.slice(0, 4).join(', ')}${result.skipped.length > 4 ? '…' : ''}`
          : undefined,
    })
  }

  /**
   * The whole Almanac as one typeset PDF — the document series writers
   * keep open and agents ask for. jsPDF rides in only when asked.
   */
  const [buildingBible, setBuildingBible] = useState(false)
  async function handleWorldBible() {
    if (!projectId) return
    const project = projects.find((p) => p.id === projectId)
    if (!project) return
    setBuildingBible(true)
    try {
      const [{ buildWorldBiblePdf }, chapters, scenes] = await Promise.all([
        import('@/features/almanac/lib/build-world-bible-pdf'),
        chapterRepo.list(),
        sceneRepo.list(),
      ])
      const built = await buildWorldBiblePdf({
        project,
        entries,
        scenes: scenes.filter((s) => s.projectId === projectId),
        chapterTitles: new Map(
          chapters.filter((c) => c.projectId === projectId).map((c) => [c.id, c.title]),
        ),
      })
      await saveExport({
        filename: built.filename,
        mimeType: 'application/pdf',
        bytes: built.bytes,
      })
      toast({
        title: 'World bible built',
        description: `${built.entryCount} ${built.entryCount === 1 ? 'entry' : 'entries'}, typeset with portraits, relationships and the timeline.`,
      })
    } finally {
      setBuildingBible(false)
    }
  }

  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<CodexEntryType | 'all'>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [view, setView] = useState<'list' | 'map' | 'atlas'>('list')

  useEffect(() => {
    if (projectId) loadProject(projectId)
  }, [projectId, loadProject])

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (typeFilter !== 'all' && entry.type !== typeFilter) return false
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return (
        entry.name.toLowerCase().includes(q) ||
        entry.aliases.some((a) => a.toLowerCase().includes(q)) ||
        entry.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [entries, typeFilter, query])

  async function handleCreate(input: Parameters<typeof createEntry>[0]) {
    const entry = await createEntry(input)
    toast({ title: `"${entry.name}" added to the Almanac` })
  }

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={Library}
          title="No project selected"
          description="Open a project from the Projects page to view its Almanac."
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
    <div className="flex h-full flex-col">
      <PageHeader
        title="Almanac"
        description={
          status === 'ready' && entries.length > 0
            ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`
            : undefined
        }
        actions={
          status === 'ready' && (
            <>
              <input
                ref={importFileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  void handleImportAlmanac(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <Button size="sm" variant="outline" onClick={() => importFileRef.current?.click()}>
                <Upload /> Import
              </Button>
              {entries.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => void handleExportAlmanac()}>
                  <Download /> Export
                </Button>
              )}
              {entries.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={buildingBible}
                  onClick={() => void handleWorldBible()}
                >
                  <BookText /> {buildingBible ? 'Typesetting…' : 'World bible'}
                </Button>
              )}
              {entries.length > 0 && (
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  <Plus /> New entry
                </Button>
              )}
            </>
          )
        }
      />

      {status === 'ready' && entries.length > 0 && (
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:px-6">
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search entries…"
              className="h-8 pl-8 text-sm"
              disabled={view !== 'list'}
            />
          </div>
          <div className="flex items-center gap-1 sm:ml-auto">
            <Button
              size="sm"
              variant={view === 'list' ? 'secondary' : 'ghost'}
              className="h-8"
              onClick={() => setView('list')}
            >
              <List className="size-3.5" /> List
            </Button>
            <Button
              size="sm"
              variant={view === 'map' ? 'secondary' : 'ghost'}
              className="h-8"
              onClick={() => setView('map')}
            >
              <Share2 className="size-3.5" /> Map
            </Button>
            <Button
              size="sm"
              variant={view === 'atlas' ? 'secondary' : 'ghost'}
              className="h-8"
              onClick={() => setView('atlas')}
            >
              <MapIcon className="size-3.5" /> Atlas
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        {status === 'ready' && entries.length > 0 && (
          <AlmanacSurvey
            projectId={projectId}
            entries={entries}
            activeType={typeFilter}
            onSelectType={(type) => setTypeFilter(type as CodexEntryType | 'all')}
          />
        )}
        {status === 'loading' || status === 'idle' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-xl" />
            ))}
          </div>
        ) : status === 'error' ? (
          <EmptyState
            icon={BookOpen}
            title="Couldn't load the Almanac"
            description={error ?? 'Something went wrong reading from local storage.'}
            action={
              <Button variant="outline" onClick={() => projectId && loadProject(projectId)}>
                Try again
              </Button>
            }
          />
        ) : entries.length === 0 ? (
          <div className="flex min-h-[70vh] items-center justify-center">
            <EmptyState
              icon={BookOpen}
              title="Your Almanac is empty"
              description="Add characters, locations, factions, and lore — everything worth remembering about your world."
              action={
                <Button onClick={() => setFormOpen(true)}>
                  <Plus /> New entry
                </Button>
              }
              className="max-w-md border-none bg-transparent"
            />
          </div>
        ) : view === 'map' ? (
          <RelationshipMap entries={entries} projectId={projectId ?? ''} />
        ) : view === 'atlas' ? (
          <AtlasView projectId={projectId} entries={entries} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matching entries"
            description="Try a different search term or filter."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {filtered.map((entry) => (
              <EntryCard key={entry.id} entry={entry} projectId={projectId} />
            ))}
          </div>
        )}
      </div>

      <EntryFormDialog open={formOpen} onOpenChange={setFormOpen} onSubmit={handleCreate} />
    </div>
  )
}
