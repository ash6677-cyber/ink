import { CheckCircle2, ChevronDown, ChevronUp, History, ListPlus, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatRelativeTime, formatWordCount } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useEditorStore } from '@/stores/editor-store'
import { SnapshotDiffDialog } from '@/features/editor/components/snapshot-diff-dialog'
import type { Scene, SceneBeat, SceneStatus, Snapshot } from '@/types'

const STATUS_OPTIONS: { value: SceneStatus; label: string }[] = [
  { value: 'outline', label: 'Outline' },
  { value: 'drafting', label: 'Drafting' },
  { value: 'revised', label: 'Revised' },
  { value: 'done', label: 'Done' },
]

interface SceneMetadataDrawerProps {
  scene: Scene
  onClose: () => void
  onContentRestored: () => void
  /** Bumped by the parent whenever a new snapshot is saved, so the History list refetches. */
  snapshotVersion: number
}

export function SceneMetadataDrawer({
  scene,
  onClose,
  onContentRestored,
  snapshotVersion,
}: SceneMetadataDrawerProps) {
  const updateSceneMeta = useEditorStore((s) => s.updateSceneMeta)
  const listSnapshots = useEditorStore((s) => s.listSnapshots)
  const restoreSnapshot = useEditorStore((s) => s.restoreSnapshot)
  const deleteSnapshot = useEditorStore((s) => s.deleteSnapshot)

  const [summaryDraft, setSummaryDraft] = useState(scene.summary)
  const [labelDraft, setLabelDraft] = useState('')
  const [beatsDraft, setBeatsDraft] = useState(scene.beats)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [pendingRestore, setPendingRestore] = useState<Snapshot | null>(null)

  // Reset local drafts whenever the active scene changes, without an effect:
  // React's recommended way to adjust state in response to a prop change.
  const [renderedSceneId, setRenderedSceneId] = useState(scene.id)
  if (scene.id !== renderedSceneId) {
    setRenderedSceneId(scene.id)
    setSummaryDraft(scene.summary)
    setBeatsDraft(scene.beats)
  }

  useEffect(() => {
    listSnapshots(scene.id).then(setSnapshots)
  }, [scene.id, listSnapshots, snapshotVersion])

  const readingMinutes = Math.max(1, Math.round(scene.wordCount / 200))

  function addLabel() {
    const label = labelDraft.trim()
    if (!label || scene.labels.includes(label)) {
      setLabelDraft('')
      return
    }
    updateSceneMeta(scene.id, { labels: [...scene.labels, label] })
    setLabelDraft('')
  }

  function addBeat() {
    const beat: SceneBeat = { id: crypto.randomUUID(), text: '', order: beatsDraft.length, generated: false }
    const next = [...beatsDraft, beat]
    setBeatsDraft(next)
    updateSceneMeta(scene.id, { beats: next })
  }

  function persistBeatText(id: string, text: string) {
    if (beatsDraft.find((b) => b.id === id)?.text === text) return
    const next = beatsDraft.map((b) => (b.id === id ? { ...b, text } : b))
    updateSceneMeta(scene.id, { beats: next })
  }

  function removeBeat(id: string) {
    const next = beatsDraft.filter((b) => b.id !== id).map((b, i) => ({ ...b, order: i }))
    setBeatsDraft(next)
    updateSceneMeta(scene.id, { beats: next })
  }

  function moveBeat(id: string, direction: -1 | 1) {
    const index = beatsDraft.findIndex((b) => b.id === id)
    const swapWith = index + direction
    if (index === -1 || swapWith < 0 || swapWith >= beatsDraft.length) return
    const next = [...beatsDraft]
    ;[next[index], next[swapWith]] = [next[swapWith], next[index]]
    const reordered = next.map((b, i) => ({ ...b, order: i }))
    setBeatsDraft(reordered)
    updateSceneMeta(scene.id, { beats: reordered })
  }

  async function handleRestore(snapshot: Snapshot) {
    await restoreSnapshot(snapshot)
    setPendingRestore(null)
    onContentRestored()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="text-sm font-semibold">Scene details</h2>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onClose}
          aria-label="Close details"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-border p-2.5">
            <p className="text-xs text-muted-foreground">Words</p>
            <p className="font-medium tabular-nums">{formatWordCount(scene.wordCount)}</p>
          </div>
          <div className="rounded-md border border-border p-2.5">
            <p className="text-xs text-muted-foreground">Reading time</p>
            <p className="font-medium tabular-nums">{readingMinutes} min</p>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label>Status</Label>
          <Select
            value={scene.status}
            onValueChange={(value: SceneStatus) => updateSceneMeta(scene.id, { status: value })}
          >
            <SelectTrigger aria-label="Scene status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="scene-summary">Summary</Label>
          <Textarea
            id="scene-summary"
            rows={4}
            value={summaryDraft}
            onChange={(e) => setSummaryDraft(e.target.value)}
            onBlur={() => {
              if (summaryDraft !== scene.summary)
                updateSceneMeta(scene.id, { summary: summaryDraft })
            }}
            placeholder="What happens in this scene? Used for planning and AI context later."
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="scene-story-day">Story day</Label>
          <Input
            id="scene-story-day"
            type="number"
            inputMode="numeric"
            className="w-32"
            value={scene.storyDay ?? ''}
            onChange={(e) => {
              const raw = e.target.value.trim()
              const parsed = Math.trunc(Number(raw))
              updateSceneMeta(scene.id, {
                storyDay: raw === '' || Number.isNaN(parsed) ? null : parsed,
              })
            }}
            placeholder="—"
          />
          <p className="text-xs text-muted-foreground">
            When this scene happens in story time. Sets its place on the Planning timeline;
            leave blank if it doesn't matter.
          </p>
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <ListPlus className="size-3.5" /> Beats
            </div>
            <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-xs" onClick={addBeat}>
              <Plus className="size-3" /> Add
            </Button>
          </div>

          {beatsDraft.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Break this scene into plot points, then expand them into a full draft from the AI
              assistant's "Beats → prose" action.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {beatsDraft.map((beat, index) => (
                <li key={beat.id} className="flex items-start gap-1">
                  <div className="flex flex-col pt-1">
                    <button
                      type="button"
                      aria-label="Move beat up"
                      disabled={index === 0}
                      onClick={() => moveBeat(beat.id, -1)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-30"
                    >
                      <ChevronUp className="size-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move beat down"
                      disabled={index === beatsDraft.length - 1}
                      onClick={() => moveBeat(beat.id, 1)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-30"
                    >
                      <ChevronDown className="size-3" />
                    </button>
                  </div>
                  <Textarea
                    value={beat.text}
                    onChange={(e) =>
                      setBeatsDraft((prev) =>
                        prev.map((b) => (b.id === beat.id ? { ...b, text: e.target.value } : b)),
                      )
                    }
                    onBlur={(e) => persistBeatText(beat.id, e.target.value)}
                    placeholder={`Beat ${index + 1}: what happens here?`}
                    rows={2}
                    className={cn('min-h-0 flex-1 resize-none text-sm', beat.generated && 'text-muted-foreground')}
                  />
                  <div className="flex flex-col items-center gap-1 pt-1">
                    {beat.generated && (
                      <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-label="Prose generated from this beat" />
                    )}
                    <button
                      type="button"
                      aria-label="Delete beat"
                      onClick={() => removeBeat(beat.id)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="scene-labels">Labels</Label>
          <div className="flex flex-wrap gap-1.5">
            {scene.labels.map((label) => (
              <Badge key={label} variant="secondary" className="gap-1 pr-1">
                {label}
                <button
                  type="button"
                  aria-label={`Remove label ${label}`}
                  onClick={() =>
                    updateSceneMeta(scene.id, { labels: scene.labels.filter((l) => l !== label) })
                  }
                  className="rounded-full p-0.5 hover:bg-background/60"
                >
                  <X className="size-2.5" />
                </button>
              </Badge>
            ))}
          </div>
          <input
            id="scene-labels"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addLabel()
              }
            }}
            onBlur={addLabel}
            placeholder="Add a label and press Enter"
            className="flex h-8 pointer-coarse:h-11 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <History className="size-3.5" /> History
          </div>
          {snapshots.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Snapshots appear here automatically as you write.
            </p>
          ) : (
            <ul className="space-y-1">
              {snapshots.map((snap) => (
                <li
                  key={snap.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"
                >
                  <div>
                    <p className="font-medium">{formatRelativeTime(snap.createdAt)}</p>
                    <p className="text-muted-foreground">{formatWordCount(snap.wordCount)} words</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setPendingRestore(snap)}
                    >
                      Compare
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label="Delete snapshot"
                      onClick={async () => {
                        await deleteSnapshot(snap.id)
                        setSnapshots((prev) => prev.filter((s) => s.id !== snap.id))
                      }}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Restoring is confirmed by showing the change itself rather than by
          describing it. A sentence saying the text will be replaced tells you
          nothing about what you are giving up; the diff does. */}
      <SnapshotDiffDialog
        snapshot={pendingRestore}
        currentText={scene.plainText}
        onOpenChange={(open) => !open && setPendingRestore(null)}
        onRestore={handleRestore}
      />
    </div>
  )
}
