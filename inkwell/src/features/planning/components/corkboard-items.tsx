import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, ListTodo, Plus, StickyNote, X } from 'lucide-react'
import { useState } from 'react'

import { StatusDot } from '@/features/editor/components/tree-items'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/stores/editor-store'
import type { Chapter, Scene, SceneBeat } from '@/types'

/**
 * The back of the index card: the scene's beats, editable in place. The
 * corkboard is where a writer thinks in beats, so making them read-only here
 * (the old behaviour: visible only in the editor's side panel) meant every
 * planning thought required a room change. Edits go through the same
 * `updateSceneMeta` the editor's panel uses — one source of truth, so a beat
 * typed here is already there when the scene opens.
 */
function CardBeats({ scene }: { scene: Scene }) {
  const updateSceneMeta = useEditorStore((s) => s.updateSceneMeta)
  const [justAddedId, setJustAddedId] = useState<string | null>(null)

  const ordered = [...scene.beats].sort((a, b) => a.order - b.order)

  function commitText(id: string, text: string) {
    const current = scene.beats.find((b) => b.id === id)
    if (!current || current.text === text) return
    void updateSceneMeta(scene.id, {
      beats: scene.beats.map((b) => (b.id === id ? { ...b, text } : b)),
    })
  }

  function addBeat() {
    const beat: SceneBeat = {
      id: crypto.randomUUID(),
      text: '',
      order: scene.beats.length,
      generated: false,
    }
    setJustAddedId(beat.id)
    void updateSceneMeta(scene.id, { beats: [...scene.beats, beat] })
  }

  function removeBeat(id: string) {
    const next = scene.beats
      .filter((b) => b.id !== id)
      .sort((a, b) => a.order - b.order)
      .map((b, i) => ({ ...b, order: i }))
    void updateSceneMeta(scene.id, { beats: next })
  }

  return (
    <div className="flex flex-col gap-1 pl-[22px]">
      {ordered.length === 0 && (
        <p className="py-1 text-xs text-muted-foreground/70">No beats yet — plot it here.</p>
      )}
      {ordered.map((beat, index) => (
        <div key={beat.id} className="group/beat flex items-center gap-1">
          <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/60">
            {index + 1}
          </span>
          <input
            defaultValue={beat.text}
            autoFocus={beat.id === justAddedId}
            placeholder="What happens…"
            aria-label={`Beat ${index + 1} of ${scene.title}`}
            onBlur={(e) => commitText(beat.id, e.target.value.trim())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            className="h-6 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-xs outline-none focus:border-border focus:bg-background pointer-coarse:h-9"
          />
          <button
            type="button"
            onClick={() => removeBeat(beat.id)}
            aria-label={`Remove beat ${index + 1} of ${scene.title}`}
            className="touch-target flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/40 opacity-0 hover:text-destructive group-hover/beat:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addBeat}
        className="mt-0.5 flex h-6 w-fit items-center gap-1 rounded px-1 text-[11px] text-muted-foreground hover:text-foreground pointer-coarse:min-h-9"
      >
        <Plus className="size-3" /> Add beat
      </button>
    </div>
  )
}

/** Flips an index card between its summary face and its beats face. */
function FlipButton({
  flipped,
  sceneTitle,
  onFlip,
}: {
  flipped: boolean
  sceneTitle: string
  onFlip: () => void
}) {
  const Icon = flipped ? StickyNote : ListTodo
  return (
    <button
      type="button"
      onClick={onFlip}
      aria-label={flipped ? `Show summary for ${sceneTitle}` : `Show beats for ${sceneTitle}`}
      aria-pressed={flipped}
      title={flipped ? 'Show summary' : 'Show beats'}
      className={cn(
        'touch-target flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground',
        flipped && 'text-primary',
      )}
    >
      <Icon className="size-3.5" />
    </button>
  )
}

interface ChapterColumnProps {
  chapter: Chapter
  scenes: Scene[]
  isDropTarget: boolean
  onOpenScene: (sceneId: string) => void
}

export function ChapterColumn({ chapter, scenes, isDropTarget, onOpenScene }: ChapterColumnProps) {
  const wordCount = scenes.reduce((sum, s) => sum + s.wordCount, 0)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chapter.id,
    data: { type: 'chapter', chapterId: chapter.id },
  })
  const { setNodeRef: setDropRef } = useDroppable({
    id: `chapter-drop-${chapter.id}`,
    data: { type: 'chapter', chapterId: chapter.id },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/30',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${chapter.title}`}
          className="touch-target flex size-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{chapter.title}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {wordCount.toLocaleString()}w
        </span>
      </div>
      <div
        ref={setDropRef}
        className={cn(
          'flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2.5',
          isDropTarget && 'bg-primary/5 ring-1 ring-inset ring-primary/30',
        )}
      >
        <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {scenes.length === 0 ? (
            <p className="px-1 py-4 text-center text-xs text-muted-foreground/70">No scenes yet</p>
          ) : (
            scenes.map((scene) => (
              <SortableSceneCard
                key={scene.id}
                scene={scene}
                chapterId={chapter.id}
                onOpen={() => onOpenScene(scene.id)}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  )
}

interface SortableSceneCardProps {
  scene: Scene
  chapterId: string
  onOpen: () => void
}

export function SortableSceneCard({ scene, chapterId, onOpen }: SortableSceneCardProps) {
  const [flipped, setFlipped] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scene.id,
    data: { type: 'scene', chapterId },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group flex flex-col gap-1.5 rounded-lg border border-border bg-card p-2.5 shadow-xs transition-shadow hover:shadow-sm',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${scene.title}`}
          className="mt-0.5 flex size-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/40 opacity-0 group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
        <StatusDot status={scene.status} />
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 truncate text-left text-sm font-medium max-sm:min-h-11 pointer-coarse:min-h-11"
        >
          {scene.title}
        </button>
        <FlipButton flipped={flipped} sceneTitle={scene.title} onFlip={() => setFlipped((v) => !v)} />
      </div>
      {flipped ? (
        <div key="beats" className="animate-slide-in">
          <CardBeats scene={scene} />
        </div>
      ) : (
        <div key="summary" className="flex flex-col gap-1.5">
          {scene.summary && (
            <p className="line-clamp-2 pl-[22px] text-xs text-muted-foreground">{scene.summary}</p>
          )}
          {scene.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 pl-[22px]">
              {scene.labels.map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-accent px-1.5 py-px text-[10px] text-accent-foreground"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
          <span className="pl-[22px] text-[11px] tabular-nums text-muted-foreground/70">
            {scene.wordCount.toLocaleString()}w
            {scene.beats.length > 0 && (
              <span className="text-muted-foreground/50"> · {scene.beats.length} beats</span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}

interface ChapterOnlyCardProps {
  chapter: Chapter
  scene?: Scene
  onOpen: () => void
}

export function ChapterOnlyCard({ chapter, scene, onOpen }: ChapterOnlyCardProps) {
  const [flipped, setFlipped] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chapter.id,
    data: { type: 'chapter', chapterId: chapter.id },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group flex w-64 shrink-0 flex-col gap-1.5 rounded-lg border border-border bg-card p-3 shadow-xs transition-shadow hover:shadow-sm',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${chapter.title}`}
          className="mt-0.5 flex size-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/40 opacity-0 group-hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
        {scene && <StatusDot status={scene.status} />}
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 truncate text-left text-sm font-semibold max-sm:min-h-11 pointer-coarse:min-h-11"
        >
          {chapter.title}
        </button>
        {scene && (
          <FlipButton
            flipped={flipped}
            sceneTitle={chapter.title}
            onFlip={() => setFlipped((v) => !v)}
          />
        )}
      </div>
      {flipped && scene ? (
        <div key="beats" className="animate-slide-in">
          <CardBeats scene={scene} />
        </div>
      ) : (
        <>
          {scene?.summary && (
            <p className="line-clamp-3 pl-[22px] text-xs text-muted-foreground">{scene.summary}</p>
          )}
          {scene && scene.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 pl-[22px]">
              {scene.labels.map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-accent px-1.5 py-px text-[10px] text-accent-foreground"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
          {scene && (
            <span className="pl-[22px] text-[11px] tabular-nums text-muted-foreground/70">
              {scene.wordCount.toLocaleString()}w
              {scene.beats.length > 0 && (
                <span className="text-muted-foreground/50"> · {scene.beats.length} beats</span>
              )}
            </span>
          )}
        </>
      )}
    </div>
  )
}
