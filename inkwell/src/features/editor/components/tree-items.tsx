import { useSortable } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight, GripVertical, MoreHorizontal, Plus } from 'lucide-react'
import { useState } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChapterTargetRing } from '@/features/editor/components/chapter-target-ring'
import {
  CHAPTER_KIND_LABEL,
  chapterKind,
  titleStatesKind,
} from '@/features/templates/lib/templates'
import { cn } from '@/lib/utils'
import type { Chapter, ChapterKind, Scene, SceneStatus } from '@/types'

const KINDS: ChapterKind[] = ['prologue', 'chapter', 'interlude', 'part', 'epilogue']

const STATUS_DOT: Record<SceneStatus, string> = {
  outline: 'bg-muted-foreground/40',
  drafting: 'bg-warning',
  revised: 'bg-primary/70',
  done: 'bg-success',
}

export function StatusDot({ status }: { status: SceneStatus }) {
  return <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[status])} />
}

interface InlineRenameProps {
  value: string
  onCommit: (value: string) => void
  onCancel: () => void
  className?: string
}

function InlineRename({ value, onCommit, onCancel, className }: InlineRenameProps) {
  const [draft, setDraft] = useState(value)
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit(draft)
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      className={cn(
        'w-full rounded-sm bg-background px-1 py-0.5 text-sm outline-none ring-1 ring-ring',
        className,
      )}
    />
  )
}

interface ChapterRowProps {
  chapter: Chapter
  wordCount: number
  expanded: boolean
  onToggleExpand: () => void
  onRename: (title: string) => void
  onSetKind: (kind: ChapterKind) => void
  onSetTarget: () => void
  onDelete: () => void
  onAddScene: () => void
  isDropTarget: boolean
  children: React.ReactNode
}

export function ChapterRow({
  chapter,
  wordCount,
  expanded,
  onToggleExpand,
  onRename,
  onSetKind,
  onSetTarget,
  onDelete,
  onAddScene,
  isDropTarget,
  children,
}: ChapterRowProps) {
  const [renaming, setRenaming] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chapter.id,
    data: { type: 'chapter', chapterId: chapter.id },
  })
  const { setNodeRef: setDropRef } = useDroppable({
    id: `chapter-drop-${chapter.id}`,
    data: { type: 'chapter', chapterId: chapter.id },
  })
  const kind = chapterKind(chapter)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('select-none', isDragging && 'opacity-50')}
    >
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md px-1.5 py-1.5 hover:bg-accent',
          isDropTarget && 'bg-accent ring-1 ring-inset ring-primary/40',
        )}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${chapter.title}`}
          className="touch-target flex size-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 opacity-0 group-hover:opacity-100 active:cursor-grabbing max-sm:opacity-70"
        >
          <GripVertical className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={expanded ? 'Collapse chapter' : 'Expand chapter'}
          aria-expanded={expanded}
          className="touch-target flex size-5 shrink-0 items-center justify-center text-muted-foreground"
        >
          <ChevronRight className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} />
        </button>

        {renaming ? (
          <InlineRename
            value={chapter.title}
            onCommit={(v) => {
              setRenaming(false)
              if (v.trim() && v !== chapter.title) onRename(v.trim())
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <button
            type="button"
            onDoubleClick={() => setRenaming(true)}
            className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left text-sm font-semibold pointer-coarse:min-h-11"
          >
            <span className="truncate">{chapter.title}</span>
            {/* Tagged only when the title doesn't already say it — otherwise
                the tag steals the room the title needs and "Prologue" reads
                as "Pr…" next to the word PROLOGUE. */}
            {kind !== 'chapter' && !titleStatesKind(chapter.title, kind) && (
              <span className="shrink-0 rounded-full border border-border px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {CHAPTER_KIND_LABEL[kind]}
              </span>
            )}
          </button>
        )}

        <ChapterTargetRing wordCount={wordCount} target={chapter.targetWords} />

        <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground group-hover:inline">
          {wordCount.toLocaleString()}w
        </span>

        <button
          type="button"
          onClick={onAddScene}
          aria-label={`Add scene to ${chapter.title}`}
          className="touch-target flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-secondary hover:text-foreground group-hover:opacity-100 max-sm:opacity-70"
        >
          <Plus className="size-3.5" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`More actions for ${chapter.title}`}
              className="touch-target flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-secondary hover:text-foreground group-hover:opacity-100 max-sm:opacity-70"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setRenaming(true)}>Rename</DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* A prologue written as an ordinary chapter throws the numbering
                out for the whole book, and until now there was no way to say
                what a division actually was after creating it. */}
            {KINDS.map((option) => (
              <DropdownMenuItem
                key={option}
                onClick={() => onSetKind(option)}
                className={cn(kind === option && 'font-medium text-primary')}
              >
                {kind === option ? '✓ ' : '\u2003'}
                {CHAPTER_KIND_LABEL[option]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSetTarget}>
              {chapter.targetWords ? 'Word target…' : 'Set word target…'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              Delete chapter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {expanded && (
        <div ref={setDropRef} className="ml-4 min-h-2 border-l border-border pl-2">
          {children}
        </div>
      )}
    </div>
  )
}

interface ChapterOnlyRowProps {
  chapter: Chapter
  status: SceneStatus | null
  wordCount: number
  active: boolean
  onSelect: () => void
  onRename: (title: string) => void
  onSetKind: (kind: ChapterKind) => void
  onSetTarget: () => void
  onDelete: () => void
}

export function ChapterOnlyRow({
  chapter,
  status,
  wordCount,
  active,
  onSelect,
  onRename,
  onSetKind,
  onSetTarget,
  onDelete,
}: ChapterOnlyRowProps) {
  const [renaming, setRenaming] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chapter.id,
    data: { type: 'chapter', chapterId: chapter.id },
  })
  const kind = chapterKind(chapter)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('select-none', isDragging && 'opacity-50')}
    >
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md px-1.5 py-1.5 hover:bg-accent',
          active && 'bg-accent',
        )}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${chapter.title}`}
          className="touch-target flex size-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 opacity-0 group-hover:opacity-100 active:cursor-grabbing max-sm:opacity-70"
        >
          <GripVertical className="size-3.5" />
        </button>

        {status && <StatusDot status={status} />}

        {renaming ? (
          <InlineRename
            value={chapter.title}
            onCommit={(v) => {
              setRenaming(false)
              if (v.trim() && v !== chapter.title) onRename(v.trim())
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <button
            type="button"
            onClick={onSelect}
            onDoubleClick={() => setRenaming(true)}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-1.5 truncate text-left text-sm',
              active ? 'font-semibold text-foreground' : 'text-foreground/80',
            )}
          >
            <span className="truncate">{chapter.title}</span>
            {kind !== 'chapter' && !titleStatesKind(chapter.title, kind) && (
              <span className="shrink-0 rounded-full border border-border px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {CHAPTER_KIND_LABEL[kind]}
              </span>
            )}
          </button>
        )}

        <ChapterTargetRing wordCount={wordCount} target={chapter.targetWords} />

        <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground group-hover:inline">
          {wordCount.toLocaleString()}w
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`More actions for ${chapter.title}`}
              className="touch-target flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-secondary hover:text-foreground group-hover:opacity-100 max-sm:opacity-70"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setRenaming(true)}>Rename</DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* A prologue written as an ordinary chapter throws the numbering
                out for the whole book, and until now there was no way to say
                what a division actually was after creating it. */}
            {KINDS.map((option) => (
              <DropdownMenuItem
                key={option}
                onClick={() => onSetKind(option)}
                className={cn(kind === option && 'font-medium text-primary')}
              >
                {kind === option ? '✓ ' : '\u2003'}
                {CHAPTER_KIND_LABEL[option]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSetTarget}>
              {chapter.targetWords ? 'Word target…' : 'Set word target…'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              Delete chapter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

interface SceneRowProps {
  scene: Scene
  chapterId: string
  active: boolean
  onSelect: () => void
  onRename: (title: string) => void
  onDelete: () => void
}

export function SceneRow({
  scene,
  chapterId,
  active,
  onSelect,
  onRename,
  onDelete,
}: SceneRowProps) {
  const [renaming, setRenaming] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scene.id,
    data: { type: 'scene', chapterId },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('select-none', isDragging && 'opacity-50')}
    >
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md px-1.5 py-1.5 hover:bg-accent',
          active && 'bg-accent',
        )}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${scene.title}`}
          className="touch-target flex size-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 opacity-0 group-hover:opacity-100 active:cursor-grabbing max-sm:opacity-70"
        >
          <GripVertical className="size-3.5" />
        </button>

        <StatusDot status={scene.status} />

        {renaming ? (
          <InlineRename
            value={scene.title}
            onCommit={(v) => {
              setRenaming(false)
              if (v.trim() && v !== scene.title) onRename(v.trim())
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <button
            type="button"
            onClick={onSelect}
            onDoubleClick={() => setRenaming(true)}
            className={cn(
              'min-w-0 flex-1 truncate text-left text-sm max-sm:min-h-11 pointer-coarse:min-h-11',
              active ? 'font-medium text-foreground' : 'text-foreground/80',
            )}
          >
            {scene.title}
          </button>
        )}

        <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground group-hover:inline">
          {scene.wordCount.toLocaleString()}w
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`More actions for ${scene.title}`}
              className="touch-target flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-secondary hover:text-foreground group-hover:opacity-100 max-sm:opacity-70"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setRenaming(true)}>Rename</DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              Delete scene
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
