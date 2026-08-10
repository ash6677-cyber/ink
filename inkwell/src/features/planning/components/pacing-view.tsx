import { AlertTriangle, Gauge } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { bookPacing, type SceneTempo } from '@/features/planning/lib/pacing'
import { formatWordCount } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/stores/editor-store'

const TEMPO_BLOCK: Record<SceneTempo['tempo'], string> = {
  brisk: 'bg-success/80 hover:bg-success',
  measured: 'bg-primary/50 hover:bg-primary/70',
  slow: 'bg-warning/80 hover:bg-warning',
}

const TEMPO_DOT: Record<SceneTempo['tempo'], string> = {
  brisk: 'bg-success',
  measured: 'bg-primary/60',
  slow: 'bg-warning',
}

const TEMPO_LABEL: Record<SceneTempo['tempo'], string> = {
  brisk: 'Brisk',
  measured: 'Measured',
  slow: 'Slow',
}

/**
 * The book's tempo as one strip: a block per scene, width proportional to
 * its length, coloured by how fast it reads — short or talkative scenes
 * brisk, long quiet ones slow. A slow scene is a choice; three in a row is
 * flagged so the writer can confirm it was one.
 */
export function PacingView({ projectId }: { projectId: string }) {
  const scenes = useEditorStore((s) => s.scenes)
  const chapters = useEditorStore((s) => s.chapters)
  const navigate = useNavigate()

  const { pacing, chapterSpans } = useMemo(() => {
    const chapterOrder = new Map(chapters.map((c) => [c.id, c.order]))
    const chapterTitle = new Map(chapters.map((c) => [c.id, c.title]))
    const ordered = [...scenes].sort(
      (a, b) =>
        (chapterOrder.get(a.chapterId) ?? 0) - (chapterOrder.get(b.chapterId) ?? 0) ||
        a.order - b.order,
    )
    const pacing = bookPacing(
      ordered.map((s) => ({
        sceneId: s.id,
        title: s.title || 'Untitled scene',
        chapterTitle: chapterTitle.get(s.chapterId) ?? 'Untitled chapter',
        plainText: s.plainText,
      })),
    )
    // Consecutive scenes of the same chapter, so the strip can break between chapters.
    const chapterSpans: { chapterTitle: string; scenes: SceneTempo[] }[] = []
    for (const scene of pacing.scenes) {
      const last = chapterSpans[chapterSpans.length - 1]
      if (last && last.chapterTitle === scene.chapterTitle) last.scenes.push(scene)
      else chapterSpans.push({ chapterTitle: scene.chapterTitle, scenes: [scene] })
    }
    return { pacing, chapterSpans }
  }, [scenes, chapters])

  const open = (sceneId: string) => navigate(`/editor?project=${projectId}&scene=${sceneId}`)

  if (pacing.scenes.length === 0) {
    return (
      <EmptyState
        icon={Gauge}
        title="No scenes yet"
        description="Write some scenes and the book's tempo shows up here as a strip — brisk, measured, slow."
        className="border-none bg-transparent"
      />
    )
  }

  const counts = { brisk: 0, measured: 0, slow: 0 }
  for (const s of pacing.scenes) counts[s.tempo]++

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6" data-pacing>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(['brisk', 'measured', 'slow'] as const).map((tempo) => (
          <span key={tempo} className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-full', TEMPO_DOT[tempo])} />
            {TEMPO_LABEL[tempo]} · {counts[tempo]}
          </span>
        ))}
        <span className="ml-auto tabular-nums">
          median scene {formatWordCount(pacing.medianWords)} words
        </span>
      </div>

      <div className="space-y-3">
        {chapterSpans.map((span, spanIndex) => (
          <div key={`${span.chapterTitle}-${spanIndex}`}>
            <p className="mb-1 truncate text-xs font-medium text-muted-foreground">
              {span.chapterTitle}
            </p>
            <div className="flex h-14 items-stretch gap-px overflow-hidden rounded-md">
              {span.scenes.map((scene) => (
                <button
                  key={scene.sceneId}
                  type="button"
                  onClick={() => open(scene.sceneId)}
                  className={cn(
                    'min-w-[14px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
                    TEMPO_BLOCK[scene.tempo],
                  )}
                  style={{ flexGrow: Math.max(scene.words, 40) }}
                  title={`${scene.title} — ${formatWordCount(scene.words)} words · ${Math.round(scene.dialogueRatio * 100)}% dialogue · ${TEMPO_LABEL[scene.tempo].toLowerCase()}`}
                  aria-label={`${scene.title}, ${TEMPO_LABEL[scene.tempo].toLowerCase()}, ${formatWordCount(scene.words)} words`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {pacing.stretches.length > 0 && (
        <div className="mt-6 space-y-2" data-pacing-stretches>
          {pacing.stretches.map((stretch) => (
            <div
              key={`${stretch.from}-${stretch.to}`}
              className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <p>
                  {stretch.sceneTitles.length} slow scenes in a row —{' '}
                  {formatWordCount(stretch.words)} words without a change of pace. Deliberate is
                  fine; unnoticed is what this flag is for.
                </p>
                <p className="mt-1 flex flex-wrap gap-x-1 text-xs text-muted-foreground">
                  {stretch.sceneTitles.map((title, i) => (
                    <button
                      key={`${title}-${i}`}
                      type="button"
                      className="underline-offset-2 hover:underline"
                      onClick={() => open(pacing.scenes[stretch.from + i].sceneId)}
                    >
                      {title}
                      {i < stretch.sceneTitles.length - 1 ? ' ·' : ''}
                    </button>
                  ))}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Tempo is arithmetic, not judgement: short scenes and dialogue-heavy scenes read brisk;
        scenes past {(1600).toLocaleString()} words that stay quiet or long-sentenced read slow.
        Click any block to open the scene.
      </p>
    </div>
  )
}
