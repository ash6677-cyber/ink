import { Layers, Loader2, Snowflake } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import {
  draftReport,
  nextDraftName,
  type DraftReport,
  type SceneRevisionStatus,
} from '@/features/editor/lib/revision'
import { formatWordCount } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/stores/editor-store'

const STATUS_STYLE: Record<SceneRevisionStatus, string> = {
  revised: 'bg-success/15 text-success border-success/30',
  untouched: 'bg-muted text-muted-foreground border-border',
  new: 'bg-primary/15 text-primary border-primary/30',
}

const STATUS_LABEL: Record<SceneRevisionStatus, string> = {
  revised: 'Revised',
  untouched: 'Untouched',
  new: 'New',
}

/**
 * Revision passes: freeze the manuscript as "Draft 1" and the book starts
 * answering revision questions — which scenes are actually revised (judged
 * by content, not by having been opened), which are untouched, what the
 * pass has done to the book's size. Each scene's frozen self also appears
 * in its History, so the existing diff view is the ghost view.
 */
export function DraftsPanel({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { toast } = useToast()
  const scenes = useEditorStore((s) => s.scenes)
  const passes = useEditorStore((s) => s.revisionPasses)
  const freezeDraft = useEditorStore((s) => s.freezeDraft)
  const loadBaselines = useEditorStore((s) => s.loadBaselines)

  const activePass = passes.length > 0 ? passes[passes.length - 1] : null

  const [report, setReport] = useState<DraftReport | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [freezing, setFreezing] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!open || !activePass) {
        if (!cancelled) setReport(null)
        return
      }
      const baselines = await loadBaselines(activePass)
      if (cancelled) return
      setReport(
        draftReport(
          scenes,
          baselines.map((b) => ({
            sceneId: b.sceneId,
            plainText: b.plainText,
            wordCount: b.wordCount,
          })),
        ),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [open, activePass, scenes, loadBaselines])

  async function handleFreeze() {
    setFreezing(true)
    try {
      const pass = await freezeDraft(nameDraft.trim() || nextDraftName(passes.length))
      setNameDraft('')
      toast({
        title: `${pass.name} frozen`,
        description: `${pass.sceneCount} scenes, ${formatWordCount(pass.wordCount)} words pinned. Revise freely — the baseline keeps the ghost.`,
      })
    } catch (error) {
      toast({
        title: 'Could not freeze this draft',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setFreezing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Drafts</DialogTitle>
          <DialogDescription>
            Freeze the book as a named draft, then revise against it. A scene only counts as
            revised when its words actually change.
          </DialogDescription>
        </DialogHeader>

        {activePass && report ? (
          <div className="space-y-4" data-draft-report>
            <div className="rounded-lg border border-border p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">
                  Revising against {activePass.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    frozen {new Date(activePass.createdAt).toLocaleDateString()}
                  </span>
                </p>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {report.revised} of {report.revised + report.untouched} scenes revised
                </p>
              </div>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-success transition-[width] duration-300"
                  style={{ width: `${Math.round(report.progress * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {report.netWords >= 0 ? '+' : ''}
                {report.netWords.toLocaleString()} words since the freeze
                {report.added > 0 && ` · ${report.added} new ${report.added === 1 ? 'scene' : 'scenes'}`}
                {report.removed > 0 && ` · ${report.removed} cut`}
              </p>
            </div>

            <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {report.scenes.map((scene) => (
                <li
                  key={scene.sceneId}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <span className="min-w-0 truncate">{scene.title || 'Untitled scene'}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {scene.wordDelta !== 0 && (
                      <span
                        className={cn(
                          'text-xs tabular-nums',
                          scene.wordDelta > 0 ? 'text-success' : 'text-destructive',
                        )}
                      >
                        {scene.wordDelta > 0 ? '+' : ''}
                        {scene.wordDelta.toLocaleString()}
                      </span>
                    )}
                    <Badge variant="outline" className={cn('text-[10px]', STATUS_STYLE[scene.status])}>
                      {STATUS_LABEL[scene.status]}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Every scene's frozen text lives in its History — open a scene's details to see
              the side-by-side against {activePass.name}.
            </p>
          </div>
        ) : (
          <p className="rounded-md border border-border bg-accent/30 p-3 text-sm text-muted-foreground">
            No draft frozen yet. Freezing pins every scene as it stands — nothing about the
            text changes, and revision progress starts counting from here.
          </p>
        )}

        <div className="flex items-end gap-2 border-t border-border pt-4">
          <div className="grid flex-1 gap-1.5">
            <label htmlFor="draft-name" className="text-xs font-medium text-muted-foreground">
              Freeze the current text as
            </label>
            <Input
              id="draft-name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder={nextDraftName(passes.length)}
            />
          </div>
          <Button onClick={() => void handleFreeze()} disabled={freezing || scenes.length === 0} className="gap-1.5">
            {freezing ? <Loader2 className="size-4 animate-spin" /> : <Snowflake className="size-4" />}
            Freeze draft
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The editor-header button that opens the panel, with the live count. */
export function DraftsButton({ onClick }: { onClick: () => void }) {
  const passes = useEditorStore((s) => s.revisionPasses)
  return (
    <Button
      variant="ghost"
      size="sm"
      className="hidden gap-1.5 text-muted-foreground 2xl:inline-flex"
      onClick={onClick}
      aria-label="Open drafts and revision progress"
    >
      <Layers className="size-3.5" />
      {passes.length > 0 ? passes[passes.length - 1].name : 'Drafts'}
    </Button>
  )
}
