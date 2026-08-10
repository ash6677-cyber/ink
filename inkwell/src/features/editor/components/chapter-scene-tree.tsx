import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  ChapterOnlyRow,
  ChapterRow,
  SceneRow,
  StatusDot,
} from '@/features/editor/components/tree-items'
import { parseTargetInput } from '@/features/editor/lib/chapter-target'
import { useEditorStore } from '@/stores/editor-store'
import type { Chapter, Scene, StructureMode } from '@/types'

type DragItemData = { type: 'chapter'; chapterId: string } | { type: 'scene'; chapterId: string }

interface PendingDelete {
  kind: 'chapter' | 'scene'
  id: string
  title: string
}

interface ChapterSceneTreeProps {
  structureMode?: StructureMode
}

export function ChapterSceneTree({ structureMode = 'scenes' }: ChapterSceneTreeProps) {
  const chapters = useEditorStore((s) => s.chapters)
  const scenes = useEditorStore((s) => s.scenes)
  const activeSceneId = useEditorStore((s) => s.activeSceneId)
  const setActiveScene = useEditorStore((s) => s.setActiveScene)
  const createChapter = useEditorStore((s) => s.createChapter)
  const renameChapter = useEditorStore((s) => s.renameChapter)
  const setChapterKind = useEditorStore((s) => s.setChapterKind)
  const deleteChapter = useEditorStore((s) => s.deleteChapter)
  const reorderChapters = useEditorStore((s) => s.reorderChapters)
  const createScene = useEditorStore((s) => s.createScene)
  const renameScene = useEditorStore((s) => s.renameScene)
  const deleteScene = useEditorStore((s) => s.deleteScene)
  const applySceneOrder = useEditorStore((s) => s.applySceneOrder)
  const setChapterTarget = useEditorStore((s) => s.setChapterTarget)

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [activeDrag, setActiveDrag] = useState<{ type: 'chapter' | 'scene'; id: string } | null>(
    null,
  )
  const [overChapterId, setOverChapterId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [targetChapter, setTargetChapter] = useState<Chapter | null>(null)
  const [targetDraft, setTargetDraft] = useState('')

  const chaptersSorted = useMemo(() => [...chapters].sort((a, b) => a.order - b.order), [chapters])
  const scenesByChapter = useMemo(() => {
    const map = new Map<string, Scene[]>()
    for (const chapter of chaptersSorted) map.set(chapter.id, [])
    for (const scene of [...scenes].sort((a, b) => a.order - b.order)) {
      map.get(scene.chapterId)?.push(scene)
    }
    return map
  }, [chaptersSorted, scenes])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function toggleExpand(chapterId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(chapterId)) next.delete(chapterId)
      else next.add(chapterId)
      return next
    })
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as DragItemData | undefined
    if (!data) return
    setActiveDrag({ type: data.type, id: String(event.active.id) })
  }

  function handleDragOver(event: DragOverEvent) {
    const activeData = event.active.data.current as DragItemData | undefined
    if (activeData?.type !== 'scene') {
      setOverChapterId(null)
      return
    }
    const overData = event.over?.data.current as DragItemData | undefined
    setOverChapterId(overData?.chapterId ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null)
    setOverChapterId(null)
    const { active, over } = event
    if (!over) return

    const activeData = active.data.current as DragItemData | undefined
    if (!activeData) return

    if (activeData.type === 'chapter') {
      const overData = over.data.current as DragItemData | undefined
      if (overData?.type !== 'chapter' || active.id === over.id) return
      const ids = chaptersSorted.map((c) => c.id)
      const oldIndex = ids.indexOf(String(active.id))
      const newIndex = ids.indexOf(String(over.id))
      if (oldIndex === -1 || newIndex === -1) return
      reorderChapters(arrayMove(ids, oldIndex, newIndex))
      return
    }

    // Scene drag
    const sceneId = String(active.id)
    const sourceChapterId = activeData.chapterId
    const overData = over.data.current as DragItemData | undefined
    if (!overData) return

    const destChapterId = overData.chapterId
    const destSiblingIds = (scenesByChapter.get(destChapterId) ?? [])
      .map((s) => s.id)
      .filter((id) => id !== sceneId)

    let destIndex: number
    if (overData.type === 'scene') {
      const overIndex = destSiblingIds.indexOf(String(over.id))
      destIndex = overIndex === -1 ? destSiblingIds.length : overIndex
    } else {
      destIndex = destSiblingIds.length
    }

    if (sourceChapterId === destChapterId) {
      const newList = [...destSiblingIds]
      newList.splice(destIndex, 0, sceneId)
      applySceneOrder(newList.map((id, index) => ({ id, chapterId: destChapterId, order: index })))
    } else {
      const sourceSiblingIds = (scenesByChapter.get(sourceChapterId) ?? [])
        .map((s) => s.id)
        .filter((id) => id !== sceneId)
      const newDestList = [...destSiblingIds]
      newDestList.splice(destIndex, 0, sceneId)
      applySceneOrder([
        ...sourceSiblingIds.map((id, index) => ({ id, chapterId: sourceChapterId, order: index })),
        ...newDestList.map((id, index) => ({ id, chapterId: destChapterId, order: index })),
      ])
    }
  }

  async function handleAddChapter() {
    const chapter = await createChapter()
    if (structureMode === 'chapters-only') await createScene(chapter.id)
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      if (pendingDelete.kind === 'chapter') await deleteChapter(pendingDelete.id)
      else await deleteScene(pendingDelete.id)
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  const activeChapter =
    activeDrag?.type === 'chapter' ? chapters.find((c) => c.id === activeDrag.id) : null
  const activeScene =
    activeDrag?.type === 'scene' ? scenes.find((s) => s.id === activeDrag.id) : null

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-2 pb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Manuscript
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1.5 text-xs"
          onClick={handleAddChapter}
        >
          <Plus className="size-3.5" /> Chapter
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveDrag(null)
          setOverChapterId(null)
        }}
      >
        <div className="flex-1 space-y-0.5 overflow-y-auto px-1 pb-4">
          {chaptersSorted.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              No chapters yet. Add one to start structuring your manuscript.
            </p>
          ) : (
            <SortableContext
              items={chaptersSorted.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {chaptersSorted.map((chapter) => {
                const chapterScenes = scenesByChapter.get(chapter.id) ?? []
                const wordCount = chapterScenes.reduce((sum, s) => sum + s.wordCount, 0)

                if (structureMode === 'chapters-only') {
                  const scene = chapterScenes[0]
                  return (
                    <ChapterOnlyRow
                      key={chapter.id}
                      chapter={chapter}
                      status={scene?.status ?? null}
                      wordCount={wordCount}
                      active={scene ? scene.id === activeSceneId : false}
                      onSelect={async () => {
                        if (scene) setActiveScene(scene.id)
                        else setActiveScene((await createScene(chapter.id)).id)
                      }}
                      onRename={(title) => renameChapter(chapter.id, title)}
                      onSetKind={(kind) => setChapterKind(chapter.id, kind)}
                      onSetTarget={() => {
                        setTargetDraft(chapter.targetWords ? String(chapter.targetWords) : '')
                        setTargetChapter(chapter)
                      }}
                      onDelete={() =>
                        setPendingDelete({ kind: 'chapter', id: chapter.id, title: chapter.title })
                      }
                    />
                  )
                }

                return (
                  <ChapterRow
                    key={chapter.id}
                    chapter={chapter}
                    wordCount={wordCount}
                    expanded={!collapsed.has(chapter.id)}
                    onToggleExpand={() => toggleExpand(chapter.id)}
                    onRename={(title) => renameChapter(chapter.id, title)}
                    onSetKind={(kind) => setChapterKind(chapter.id, kind)}
                    onSetTarget={() => {
                      setTargetDraft(chapter.targetWords ? String(chapter.targetWords) : '')
                      setTargetChapter(chapter)
                    }}
                    onDelete={() =>
                      setPendingDelete({ kind: 'chapter', id: chapter.id, title: chapter.title })
                    }
                    onAddScene={() => createScene(chapter.id)}
                    isDropTarget={overChapterId === chapter.id}
                  >
                    <SortableContext
                      items={chapterScenes.map((s) => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {chapterScenes.length === 0 ? (
                        <p className="px-2 py-2 text-xs text-muted-foreground/70">No scenes yet</p>
                      ) : (
                        chapterScenes.map((scene) => (
                          <SceneRow
                            key={scene.id}
                            scene={scene}
                            chapterId={chapter.id}
                            active={scene.id === activeSceneId}
                            onSelect={() => setActiveScene(scene.id)}
                            onRename={(title) => renameScene(scene.id, title)}
                            onDelete={() =>
                              setPendingDelete({ kind: 'scene', id: scene.id, title: scene.title })
                            }
                          />
                        ))
                      )}
                    </SortableContext>
                  </ChapterRow>
                )
              })}
            </SortableContext>
          )}
        </div>

        <DragOverlay>
          {activeChapter ? (
            <div className="rounded-md border border-border bg-card px-2 py-1.5 text-sm font-semibold shadow-lg">
              {activeChapter.title}
            </div>
          ) : activeScene ? (
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-sm shadow-lg">
              <StatusDot status={activeScene.status} />
              {activeScene.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Dialog
        open={targetChapter !== null}
        onOpenChange={(open) => !open && setTargetChapter(null)}
      >
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Word target for "{targetChapter?.title}"</DialogTitle>
            <DialogDescription>
              A little ring in the chapter list fills as you write toward it. Leave blank to
              remove the target.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            type="number"
            min={0}
            step={100}
            inputMode="numeric"
            value={targetDraft}
            onChange={(e) => setTargetDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && targetChapter) {
                void setChapterTarget(targetChapter.id, parseTargetInput(targetDraft))
                setTargetChapter(null)
              }
            }}
            placeholder="e.g. 3000"
            aria-label="Chapter word target"
          />
          <DialogFooter>
            <Button
              onClick={() => {
                if (targetChapter) {
                  void setChapterTarget(targetChapter.id, parseTargetInput(targetDraft))
                  setTargetChapter(null)
                }
              }}
            >
              Save target
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingDelete?.kind} "{pendingDelete?.title}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.kind === 'chapter'
                ? "This deletes the chapter and every scene inside it. This can't be undone."
                : "This permanently deletes the scene and its content. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleConfirmDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
