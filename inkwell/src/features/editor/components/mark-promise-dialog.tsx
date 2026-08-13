import type { Editor } from '@tiptap/react'
import { Anchor } from 'lucide-react'
import { useState } from 'react'

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
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/use-toast'
import { getSelectionText } from '@/features/editor/lib/ai-insert'
import { suggestTitle } from '@/features/planning/lib/promises'
import { useEditorStore } from '@/stores/editor-store'

/**
 * Chekhov's gun goes on the ledger from right here in the prose: select
 * the locket / the rifle / the scar, mark it, and the Promises tab in
 * Planning starts asking when it pays off. Works without a selection too —
 * then the writer just names the promise.
 */
export function MarkPromiseButton({
  editor,
  sceneId,
}: {
  editor: Editor | null
  sceneId: string
}) {
  const { toast } = useToast()
  const addPromise = useEditorStore((s) => s.addPromise)

  const [open, setOpen] = useState(false)
  const [quote, setQuote] = useState('')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  function handleOpen() {
    const selected = editor ? getSelectionText(editor) : ''
    setQuote(selected)
    setTitle(suggestTitle(selected))
    setNote('')
    setOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const created = await addPromise({ title, quote, note, setupSceneId: sceneId })
      setOpen(false)
      toast({
        title: 'Promise made',
        description: `“${created.title}” is on the ledger — link its payoff from Planning → Promises.`,
      })
    } catch (error) {
      toast({
        title: 'Could not save this promise',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOpen}
            aria-label="Mark a promise in this scene"
          >
            <Anchor className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Mark a promise</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark a promise</DialogTitle>
            <DialogDescription>
              A setup the reader will expect paid off — the locket, the loaded rifle, the
              unexplained scar. It lands on the ledger with this scene as where it was made.
            </DialogDescription>
          </DialogHeader>

          {quote && (
            <blockquote className="max-h-24 overflow-y-auto border-l-2 border-primary/40 pl-3 text-sm italic text-muted-foreground">
              {quote}
            </blockquote>
          )}

          <div className="grid gap-1.5">
            <label htmlFor="promise-title" className="text-xs font-medium text-muted-foreground">
              The promise, in a few words
            </label>
            <Input
              id="promise-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="The locket her mother never explained"
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="promise-note" className="text-xs font-medium text-muted-foreground">
              Note to yourself <span className="font-normal">(optional)</span>
            </label>
            <Textarea
              id="promise-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Pays off when she opens it at the funeral."
            />
          </div>

          <DialogFooter>
            <Button
              onClick={() => void handleSave()}
              disabled={saving || title.trim().length === 0}
            >
              Put it on the ledger
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
