import { Library, Plus, Sparkles, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { EmptyState } from '@/components/common/empty-state'
import { ClaimGuestLibraryBanner } from '@/components/common/claim-guest-library-banner'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { ProjectCard } from '@/features/projects/components/project-card'
import { ExportDialog } from '@/features/export/components/export-dialog'
import { ImportManuscriptDialog } from '@/features/import/components/import-manuscript-dialog'
import { ProjectFormDialog } from '@/features/projects/components/project-form-dialog'
import { maybeSeedSampleBook } from '@/features/projects/lib/sample-book'
import { useProjectStore } from '@/stores/project-store'
import { useUiStore } from '@/stores/ui-store'
import type { Project } from '@/types'
import { useDocumentTitle } from '@/lib/hooks/use-document-title'

export function ProjectsHome() {
  useDocumentTitle('Projects')
  const {
    projects,
    wordCounts,
    status,
    error,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
  } = useProjectStore()
  const { toast } = useToast()

  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [editingProject, setEditingProject] = useState<Project | undefined>(undefined)
  const [deletingProject, setDeletingProject] = useState<Project | null>(null)
  const [exportingProject, setExportingProject] = useState<Project | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    // The sample book gets its one chance to exist before the first fetch,
    // so a brand-new library's first paint already has something on it
    // rather than flashing empty and then filling in.
    // The catch is not decoration: with storage blocked (private windows),
    // seeding rejects, and an unhandled rejection here would race the
    // storage gate's explanation with an error overlay.
    maybeSeedSampleBook()
      .catch(() => {})
      .finally(() => fetchProjects())
  }, [fetchProjects])

  function openCreateDialog() {
    setEditingProject(undefined)
    setFormKey((k) => k + 1)
    setFormOpen(true)
  }

  const newProjectRequestNonce = useUiStore((s) => s.newProjectRequestNonce)
  const lastHandledNonce = useRef(newProjectRequestNonce)
  useEffect(() => {
    if (newProjectRequestNonce !== lastHandledNonce.current) {
      lastHandledNonce.current = newProjectRequestNonce
      openCreateDialog()
    }
  }, [newProjectRequestNonce])

  function openEditDialog(project: Project) {
    setEditingProject(project)
    setFormKey((k) => k + 1)
    setFormOpen(true)
  }

  async function handleSubmit(input: Parameters<typeof createProject>[0]) {
    if (editingProject) {
      await updateProject(editingProject.id, input)
      toast({ title: 'Project updated' })
    } else {
      await createProject(input)
      toast({ title: 'Project created' })
    }
  }

  async function handleConfirmDelete() {
    if (!deletingProject) return
    setDeleting(true)
    try {
      await deleteProject(deletingProject.id)
      toast({ title: `"${deletingProject.title}" deleted` })
      setDeletingProject(null)
    } catch {
      toast({ title: 'Could not delete the project', variant: 'destructive' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Projects"
        description={
          status === 'ready' && projects.length > 0
            ? `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`
            : undefined
        }
        actions={
          status === 'ready' &&
          projects.length > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                <Upload /> Import
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link to="/book-creator">
                  <Sparkles /> Book Creator
                </Link>
              </Button>
              <Button size="sm" onClick={openCreateDialog}>
                <Plus /> New project
              </Button>
            </>
          )
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <ClaimGuestLibraryBanner />
        {status === 'loading' || status === 'idle' ? (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(20rem,1fr))]">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : status === 'error' ? (
          <EmptyState
            icon={Library}
            title="Couldn't load your projects"
            description={error ?? 'Something went wrong reading from local storage.'}
            action={
              <Button variant="outline" onClick={() => fetchProjects()}>
                Try again
              </Button>
            }
          />
        ) : projects.length === 0 ? (
          <div className="flex min-h-[70vh] items-center justify-center">
            <EmptyState
              icon={Library}
              title="No projects yet"
              description="Start something new, or bring in a manuscript you have already written."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button onClick={openCreateDialog}>
                    <Plus /> New project
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/book-creator">
                      <Sparkles /> Use Book Creator
                    </Link>
                  </Button>
                  <Button variant="outline" onClick={() => setImportOpen(true)}>
                    <Upload /> Import a manuscript
                  </Button>
                </div>
              }
              className="max-w-md border-none bg-transparent"
            />
          </div>
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(20rem,1fr))]">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                currentWordCount={wordCounts[project.id] ?? 0}
                onEdit={() => openEditDialog(project)}
                onExport={() => setExportingProject(project)}
                onDelete={() => setDeletingProject(project)}
              />
            ))}
          </div>
        )}
      </div>

      <ExportDialog
        project={exportingProject}
        open={exportingProject !== null}
        onOpenChange={(open) => !open && setExportingProject(null)}
      />

      <ImportManuscriptDialog open={importOpen} onOpenChange={setImportOpen} />

      <ProjectFormDialog
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        project={editingProject}
        onSubmit={handleSubmit}
      />

      <ConfirmDeleteDialog
        open={deletingProject !== null}
        onOpenChange={(open) => !open && setDeletingProject(null)}
        title={`Delete "${deletingProject?.title}"?`}
        description="This permanently deletes the project from this device. This can't be undone."
        pending={deleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
