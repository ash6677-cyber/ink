import { AlertTriangle, CalendarClock } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { buildTimeline, dayLabel } from '@/features/planning/lib/timeline'
import { useEditorStore } from '@/stores/editor-store'

/**
 * The book on a when-it-happens axis. Scenes carry an optional story-day
 * (set in Scene details); this groups them by day, ascending, with undated
 * scenes gathered at the end, and warns when reading order runs ahead of
 * story time — the "funeral before the death" tell.
 */
export function TimelineView({ projectId }: { projectId: string }) {
  const scenes = useEditorStore((s) => s.scenes)
  const chapters = useEditorStore((s) => s.chapters)
  const navigate = useNavigate()

  const timeline = useMemo(() => {
    const chapterOrder = new Map(chapters.map((c) => [c.id, c.order]))
    const chapterTitle = new Map(chapters.map((c) => [c.id, c.title]))
    const ordered = [...scenes].sort(
      (a, b) =>
        (chapterOrder.get(a.chapterId) ?? 0) - (chapterOrder.get(b.chapterId) ?? 0) ||
        a.order - b.order,
    )
    return buildTimeline(
      ordered.map((s, readingIndex) => ({
        id: s.id,
        title: s.title,
        chapterTitle: chapterTitle.get(s.chapterId) ?? 'Untitled chapter',
        storyDay: s.storyDay ?? null,
        order: readingIndex,
      })),
    )
  }, [scenes, chapters])

  const open = (sceneId: string) => navigate(`/editor?project=${projectId}&scene=${sceneId}`)

  if (timeline.days.length === 0 && timeline.undated.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No scenes yet"
        description="Write some scenes, give them a story day in Scene details, and they'll line up here in story order."
        className="border-none bg-transparent"
      />
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      {timeline.days.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">
          No scene has a story day yet. Set one in Scene details and it will appear here in
          story order.
        </p>
      ) : (
        timeline.hasReversal && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              Reading order runs out of step with story time here — a later scene happens on an
              earlier day. Intentional for a flashback; worth a look otherwise.
            </span>
          </div>
        )
      )}

      <ol className="space-y-6 border-l border-border pl-5">
        {timeline.days.map((day) => (
          <li key={day.day} className="relative">
            <span className="absolute -left-[27px] top-1 size-3 rounded-full bg-primary ring-4 ring-background" />
            <h3 className="text-sm font-semibold">{dayLabel(day.day)}</h3>
            <ul className="mt-2 space-y-1.5">
              {day.scenes.map((scene) => (
                <li key={scene.id}>
                  <button
                    type="button"
                    onClick={() => open(scene.id)}
                    className="flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left hover:bg-accent"
                  >
                    <span className="text-sm">{scene.title || 'Untitled scene'}</span>
                    <span className="text-xs text-muted-foreground">{scene.chapterTitle}</span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {timeline.undated.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-muted-foreground">No story day yet</h3>
          <ul className="mt-2 space-y-1.5">
            {timeline.undated.map((scene) => (
              <li key={scene.id}>
                <button
                  type="button"
                  onClick={() => open(scene.id)}
                  className="flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left hover:bg-accent"
                >
                  <span className="text-sm">{scene.title || 'Untitled scene'}</span>
                  <span className="text-xs text-muted-foreground">{scene.chapterTitle}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
