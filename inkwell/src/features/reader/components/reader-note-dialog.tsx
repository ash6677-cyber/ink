import { Loader2, Send } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import {
  NAME_MAX,
  NOTE_MAX,
  QUOTE_MAX,
  submitReaderNote,
} from '@/features/reader/lib/share-book'

/**
 * The beta reader's note to the author. A suggestion box, not a comment
 * thread: the note goes to the writer alone, can't be edited once sent,
 * and asks for nothing — not even a name — beyond the note itself.
 */
export function ReaderNoteDialog({
  open,
  onOpenChange,
  shareId,
  chapterIndex,
  chapterTitle,
  initialQuote,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  shareId: string
  chapterIndex: number
  chapterTitle: string
  initialQuote: string
}) {
  const { toast } = useToast()
  const [note, setNote] = useState('')
  const [name, setName] = useState('')
  const [quote, setQuote] = useState(initialQuote)
  const [sending, setSending] = useState(false)

  // A fresh opening starts a fresh note, carrying whatever the reader had
  // selected on the page when they reached for the button. Adjusted during
  // render rather than in an effect, per the house pattern.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setQuote(initialQuote)
  }

  async function handleSend() {
    if (!note.trim()) return
    setSending(true)
    const delivered = await submitReaderNote(shareId, {
      chapterIndex,
      quote: quote.trim(),
      note: note.trim(),
      name: name.trim(),
    })
    setSending(false)
    if (delivered) {
      toast({ title: 'Note sent to the author' })
      setNote('')
      onOpenChange(false)
    } else {
      toast({
        title: 'Couldn’t send the note',
        description: 'The author may have stopped sharing, or the connection failed.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Leave a note for the author</DialogTitle>
          <DialogDescription>
            Goes privately to the writer, tagged to {chapterTitle || 'this chapter'}. They
            can’t reply here, so sign it if you want them to know who to thank.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="reader-note">Your note</Label>
            <Textarea
              id="reader-note"
              value={note}
              maxLength={NOTE_MAX}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What worked, what tripped you, what you want more of…"
              rows={4}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reader-note-quote">The line it’s about (optional)</Label>
            <Input
              id="reader-note-quote"
              value={quote}
              maxLength={QUOTE_MAX}
              onChange={(e) => setQuote(e.target.value)}
              placeholder="Select text on the page first, or paste it here"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reader-note-name">Your name (optional)</Label>
            <Input
              id="reader-note-name"
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="Anonymous"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => void handleSend()} disabled={sending || note.trim().length === 0}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
