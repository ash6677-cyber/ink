import { AlertTriangle, Anchor, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { buildLedger, type LedgerEntry, type PromiseStatus } from '@/features/planning/lib/promises'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/stores/editor-store'

const STATUS_STYLE: Record<PromiseStatus, string> = {
  open: 'bg-warning/15 text-warning border-warning/30',
  paid: 'bg-success/15 text-success border-success/30',
  backwards: 'bg-destructive/15 text-destructive border-destructive/30',
}

const STATUS_LABEL: Record<PromiseStatus, string> = {
  open: 'Open',
  paid: 'Paid off',
  backwards: 'Pays off too early',
}

/** No payoff yet — the sentinel the Select uses, since '' is not allowed. */
const UNPAID = 'unpaid'

/**
 * The promises & payoffs ledger. Every setup marked in the manuscript (or
 * added here), where it was made, where it pays off — and front and
 * centre, the ones still unpaid at the end of the book.
 */
export function PromisesView({ projectId }: { projectId: string }) {
  const scenes = useEditorStore((s) => s.scenes)
  const chapters = useEditorStore((s) => s.chapters)
  const promises = useEditorStore((s) => s.promises)
  const addPromise = useEditorStore((s) => s.addPromise)
  const setPromisePayoff = useEditorStore((s) => s.setPromisePayoff)
  const removePromise = useEditorStore((s) => s.removePromise)
  const navigate = useNavigate()

  const orderedScenes = useMemo(() => {
    const chapterOrder = new Map(chapters.map((c) => [c.id, c.order]))
    return [...scenes]
      .sort(
        (a, b) =>
          (chapterOrder.get(a.chapterId) ?? 0) - (chapterOrder.get(b.chapterId) ?? 0) ||
          a.order - b.order,
      )
      .map((s) => ({ id: s.id, title: s.title || 'Untitled scene' }))
  }, [scenes, chapters])

  const ledger = useMemo(() => buildLedger(promises, orderedScenes), [promises, orderedScenes])

  const [newTitle, setNewTitle] = useState('')
  const [newSetupId, setNewSetupId] = useState('')

  const open = (sceneId: string) => navigate(`/editor?project=${projectId}&scene=${sceneId}`)

  async function handleAdd() {
    if (!newTitle.trim() || !newSetupId) return
    await addPromise({ title: newTitle, quote: '', setupSceneId: newSetupId })
    setNewTitle('')
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6" data-promises>
      {ledger.entries.length > 0 && ledger.unpaid.length > 0 && (
        <div
          className="mb-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
          data-unpaid-warning
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            {ledger.unpaid.length === 1
              ? '1 promise is still unpaid'
              : `${ledger.unpaid.length} promises are still unpaid`}{' '}
            at the end of the book:{' '}
            {ledger.unpaid.map((entry) => `“${entry.promise.title}”`).join(', ')}. Every one is a
            reader who remembers.
          </span>
        </div>
      )}

      {ledger.entries.length === 0 ? (
        <EmptyState
          icon={Anchor}
          title="No promises on the ledger"
          description="Select a passage in the editor and mark it as a promise — the locket, the rifle, the scar — or add one below. Then this page keeps score until every one pays off."
          className="border-none bg-transparent"
        />
      ) : (
        <ul className="space-y-2">
          {ledger.entries.map((entry) => (
            <LedgerRow
              key={entry.promise.id}
              entry={entry}
              orderedScenes={orderedScenes}
              onOpenScene={open}
              onSetPayoff={(sceneId) => void setPromisePayoff(entry.promise.id, sceneId)}
              onRemove={() => void removePromise(entry.promise.id)}
            />
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-2 border-t border-border pt-4">
        <div className="grid min-w-48 flex-1 gap-1.5">
          <label htmlFor="new-promise" className="text-xs font-medium text-muted-foreground">
            Add a promise
          </label>
          <Input
            id="new-promise"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="The rifle above the mantel"
          />
        </div>
        <div className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Made in</span>
          <Select value={newSetupId} onValueChange={setNewSetupId}>
            <SelectTrigger className="w-48" aria-label="Scene where the promise is made">
              <SelectValue placeholder="Pick a scene" />
            </SelectTrigger>
            <SelectContent>
              {orderedScenes.map((scene) => (
                <SelectItem key={scene.id} value={scene.id}>
                  {scene.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => void handleAdd()}
          disabled={!newTitle.trim() || !newSetupId}
          className="gap-1.5"
        >
          <Plus className="size-4" /> Add
        </Button>
      </div>
    </div>
  )
}

function LedgerRow({
  entry,
  orderedScenes,
  onOpenScene,
  onSetPayoff,
  onRemove,
}: {
  entry: LedgerEntry
  orderedScenes: { id: string; title: string }[]
  onOpenScene: (sceneId: string) => void
  onSetPayoff: (sceneId: string | null) => void
  onRemove: () => void
}) {
  const { promise } = entry
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{promise.title}</p>
        <Badge variant="outline" className={cn('shrink-0 text-[10px]', STATUS_STYLE[entry.status])}>
          {STATUS_LABEL[entry.status]}
        </Badge>
      </div>

      {promise.quote && (
        <blockquote className="mt-1.5 line-clamp-2 border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
          {promise.quote}
        </blockquote>
      )}
      {promise.note && <p className="mt-1.5 text-xs text-muted-foreground">{promise.note}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
        <span>
          Made in{' '}
          <button
            type="button"
            className="font-medium text-foreground underline-offset-2 hover:underline"
            onClick={() => onOpenScene(promise.setupSceneId)}
          >
            {entry.setupTitle}
          </button>
        </span>
        <span className="flex items-center gap-1.5">
          Pays off in
          <Select
            value={promise.payoffSceneId ?? UNPAID}
            onValueChange={(value) => onSetPayoff(value === UNPAID ? null : value)}
          >
            <SelectTrigger
              className="h-7 w-44 text-xs"
              aria-label={`Payoff scene for ${promise.title}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNPAID}>Not yet</SelectItem>
              {orderedScenes.map((scene) => (
                <SelectItem key={scene.id} value={scene.id}>
                  {scene.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
        {entry.status === 'paid' && (
          <span className="tabular-nums">
            {entry.span === 0 ? 'same scene' : `${entry.span} scene${entry.span === 1 ? '' : 's'} later`}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label={`Delete promise ${promise.title}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  )
}
