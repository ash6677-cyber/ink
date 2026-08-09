import { BookOpen, Library, Share2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { Button } from '@/components/ui/button'
import { BookStage } from '@/features/reader/components/book-stage'
import { ReaderThemeToggle } from '@/features/reader/components/reader-theme-toggle'
import { ShareBookDialog } from '@/features/reader/components/share-book-dialog'
import { useReaderThemeClass } from '@/features/reader/lib/use-reader-theme'
import { cn } from '@/lib/utils'
import { compileBook } from '@/features/reader/lib/compile-book'
import { cloudEnabled } from '@/lib/firebase/cloud-flags'
import { projectRepo } from '@/lib/db/repositories'
import { useAuthStore } from '@/stores/auth-store'
import { useEditorStore } from '@/stores/editor-store'
import type { Project } from '@/types'

import '@/features/reader/reader.css'
import { useDocumentTitle } from '@/lib/hooks/use-document-title'

export function ReaderHome() {
  useDocumentTitle('Read')
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

  const chapters = useEditorStore((s) => s.chapters)
  const scenes = useEditorStore((s) => s.scenes)
  const status = useEditorStore((s) => s.status)
  const loadProject = useEditorStore((s) => s.loadProject)
  useEffect(() => {
    if (projectId) loadProject(projectId)
  }, [projectId, loadProject])

  const book = useMemo(() => compileBook(chapters, scenes), [chapters, scenes])

  const user = useAuthStore((s) => s.user)
  const [shareOpen, setShareOpen] = useState(false)
  const readerThemeClass = useReaderThemeClass()

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={Library}
          title="No project selected"
          description="Open a project from the Projects page to read it as a book."
          action={
            <Button asChild>
              <Link to="/projects">Go to Projects</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const noContent = status === 'ready' && book.length === 0

  return (
    <div
      className={cn(
        'book-reader flex h-full flex-col bg-gradient-to-b from-background to-muted/30',
        readerThemeClass,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate font-serif text-base font-semibold">
            {project?.title ?? 'Reading'}
          </h1>
          {project?.author && (
            <p className="truncate text-xs text-muted-foreground">{project.author}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ReaderThemeToggle />
          {/* Sharing is a cloud act: it needs an account to own the copy and
              a project to hold it. Signed out (or cloudless build), the
              button simply isn't there rather than being there and failing. */}
          {cloudEnabled && user && project && (
            <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
              <Share2 className="size-3.5" /> Share
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link to={`/editor?project=${projectId}`}>Back to editor</Link>
          </Button>
        </div>
      </header>

      {noContent ? (
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            icon={BookOpen}
            title="Nothing to read yet"
            description="Add a chapter and write a scene, then come back to see it as a book."
            className="border-none bg-transparent"
          />
        </div>
      ) : (
        <BookStage
          book={book}
          title={project?.title ?? ''}
          author={project?.author ?? ''}
          projectId={projectId}
        />
      )}

      {project && (
        <ShareBookDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          project={project}
          onProjectChange={setProject}
          book={book}
        />
      )}
    </div>
  )
}
