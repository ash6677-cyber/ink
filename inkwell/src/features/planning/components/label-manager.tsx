import { Check, Pencil, Tags, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { countLabels } from '@/lib/labels'
import { useEditorStore } from '@/stores/editor-store'

/**
 * Labels are free-typed strings on scenes, which is exactly right until the
 * book has "subplot-ferry", "Subplot: ferry" and "ferry subplot" all meaning
 * the same thread. This dialog is the repair shop: every label in the
 * project with its usage count, renameable in place — and renaming one onto
 * another IS the merge, deduplicated per scene by the store.
 */
export function LabelManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const scenes = useEditorStore((s) => s.scenes)
  const renameLabel = useEditorStore((s) => s.renameLabel)
  const removeLabel = useEditorStore((s) => s.removeLabel)

  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const labels = useMemo(() => countLabels(scenes), [scenes])

  const mergeTarget =
    editing !== null &&
    draft.trim() !== '' &&
    draft.trim() !== editing &&
    labels.some(([name]) => name === draft.trim())
      ? draft.trim()
      : null

  async function commitRename() {
    if (editing === null) return
    const next = draft.trim()
    if (next && next !== editing) await renameLabel(editing, next)
    setEditing(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Labels</DialogTitle>
          <DialogDescription>
            Rename a label to fix its spelling everywhere at once. Renaming it to another
            label&rsquo;s name merges the two.
          </DialogDescription>
        </DialogHeader>

        {labels.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Tags className="size-6 text-muted-foreground/60" aria-hidden />
            <p className="text-sm text-muted-foreground">
              No labels yet. Add them to scenes from the editor&rsquo;s details panel — they
              appear on the corkboard cards too.
            </p>
          </div>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {labels.map(([name, count]) => (
              <li key={name} className="flex items-center gap-2 rounded-md px-1 py-1">
                {editing === name ? (
                  <>
                    <Input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitRename()
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      aria-label={`New name for label ${name}`}
                      className="h-8 flex-1 text-sm pointer-coarse:h-11"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0 pointer-coarse:size-11"
                      aria-label={`Save new name for ${name}`}
                      onClick={() => void commitRename()}
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0 pointer-coarse:size-11"
                      aria-label={`Stop renaming ${name}`}
                      onClick={() => setEditing(null)}
                    >
                      <X className="size-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                      {name}
                    </span>
                    <span className="flex-1 text-xs tabular-nums text-muted-foreground">
                      {count} {count === 1 ? 'scene' : 'scenes'}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0 pointer-coarse:size-11"
                      aria-label={`Rename label ${name}`}
                      onClick={() => {
                        setEditing(name)
                        setDraft(name)
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive pointer-coarse:size-11"
                      aria-label={`Remove label ${name} from every scene`}
                      onClick={() => void removeLabel(name)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {mergeTarget && (
          <p className="text-xs text-muted-foreground">
            &ldquo;{editing}&rdquo; will merge into &ldquo;{mergeTarget}&rdquo; — every scene
            carrying either ends up with just &ldquo;{mergeTarget}&rdquo;.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
