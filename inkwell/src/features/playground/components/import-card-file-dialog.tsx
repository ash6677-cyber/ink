import { Loader2 } from 'lucide-react'
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
import { useToast } from '@/components/ui/use-toast'
import { CardFace } from '@/features/playground/components/card-face'
import type { CardFileData } from '@/features/playground/lib/card-file'
import { createCardFromFile } from '@/features/playground/lib/card-import'

/**
 * The look-before-you-commit step of importing a card file: the face drawn
 * from the file's own data, and a plain list of what arrives with it. The
 * card only exists once the writer says so.
 */
export function ImportCardFileDialog({
  data,
  onOpenChange,
}: {
  data: CardFileData | null
  onOpenChange: (open: boolean) => void
}) {
  const { toast } = useToast()
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!data) return
    setCreating(true)
    try {
      await createCardFromFile(data)
      toast({ title: `${data.displayName} joined the cast` })
      onOpenChange(false)
    } catch {
      toast({ title: 'Could not import the card', variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  const arriving = data
    ? [
        data.description && 'description',
        data.personality && 'personality',
        data.scenario && 'scenario',
        data.firstMessage && 'first message',
        data.exampleDialogue.length > 0 && `${data.exampleDialogue.length} dialogue lines`,
        data.voiceNotes && 'voice notes',
        data.tags.length > 0 && `${data.tags.length} tags`,
        data.avatarDataUrl && 'portrait',
        data.design && 'card design',
      ].filter(Boolean)
    : []

  return (
    <Dialog open={data !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Import this character?</DialogTitle>
          <DialogDescription>
            Nothing is saved until you choose to add them to the cast.
          </DialogDescription>
        </DialogHeader>
        {data && (
          <>
            <div className="mx-auto w-48">
              <CardFace
                name={data.displayName}
                design={data.design}
                imageUrl={data.avatarDataUrl ?? null}
                crop={null}
                tags={data.tags}
                compact
                still
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Arrives with: {arriving.length > 0 ? arriving.join(', ') : 'a name, nothing more'}.
            </p>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleCreate()} disabled={creating}>
            {creating && <Loader2 className="size-4 animate-spin" />} Add to cast
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
