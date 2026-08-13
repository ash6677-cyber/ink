import { Library, Tags } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CorkboardView } from '@/features/planning/components/corkboard-view'
import { DialogueView } from '@/features/planning/components/dialogue-view'
import { LabelManagerDialog } from '@/features/planning/components/label-manager'
import { PacingView } from '@/features/planning/components/pacing-view'
import { PromisesView } from '@/features/planning/components/promises-view'
import { StatusBoardView } from '@/features/planning/components/status-board-view'
import { SubmissionsView } from '@/features/planning/components/submissions-view'
import { TimelineView } from '@/features/planning/components/timeline-view'
import { projectRepo } from '@/lib/db/repositories'
import { useEditorStore } from '@/stores/editor-store'
import type { Project } from '@/types'
import { useDocumentTitle } from '@/lib/hooks/use-document-title'

export function PlanningHome() {
  useDocumentTitle('Planning')
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('project')

  const [project, setProject] = useState<Project | null | undefined>(undefined)
  const [labelsOpen, setLabelsOpen] = useState(false)
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
  const loadProject = useEditorStore((s) => s.loadProject)
  useEffect(() => {
    if (projectId) loadProject(projectId)
  }, [projectId, loadProject])

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={Library}
          title="No project selected"
          description="Open a project from the Projects page to plan its structure."
          action={
            <Button asChild>
              <Link to="/projects">Go to Projects</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const structureMode = project?.settings.structureMode ?? 'scenes'

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Planning"
        description={project?.title}
        actions={
          <Button variant="outline" size="sm" onClick={() => setLabelsOpen(true)}>
            <Tags className="size-3.5" /> Labels
          </Button>
        }
      />
      <LabelManagerDialog open={labelsOpen} onOpenChange={setLabelsOpen} />
      {status === 'loading' || status === 'idle' ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Tabs defaultValue="corkboard" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 mt-3 w-fit">
            <TabsTrigger value="corkboard">Outline</TabsTrigger>
            <TabsTrigger value="status">Status board</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="pacing">Pacing</TabsTrigger>
            <TabsTrigger value="promises">Promises</TabsTrigger>
            <TabsTrigger value="dialogue">Dialogue</TabsTrigger>
            <TabsTrigger value="submissions">Submissions</TabsTrigger>
          </TabsList>
          <TabsContent value="corkboard" className="min-h-0 flex-1">
            <CorkboardView projectId={projectId} structureMode={structureMode} />
          </TabsContent>
          <TabsContent value="status" className="min-h-0 flex-1">
            <StatusBoardView projectId={projectId} />
          </TabsContent>
          <TabsContent value="timeline" className="min-h-0 flex-1">
            <TimelineView projectId={projectId} />
          </TabsContent>
          <TabsContent value="pacing" className="min-h-0 flex-1">
            <PacingView projectId={projectId} />
          </TabsContent>
          <TabsContent value="promises" className="min-h-0 flex-1">
            <PromisesView projectId={projectId} />
          </TabsContent>
          <TabsContent value="dialogue" className="min-h-0 flex-1">
            <DialogueView projectId={projectId} />
          </TabsContent>
          <TabsContent value="submissions" className="min-h-0 flex-1">
            <SubmissionsView projectId={projectId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
