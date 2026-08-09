import { Check, Copy, Eye, Globe, Loader2, MessageSquare, X } from 'lucide-react'
import { useEffect, useState } from 'react'

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
import { useToast } from '@/components/ui/use-toast'
import type { BookChapter } from '@/features/reader/lib/compile-book'
import {
  deleteReaderNote,
  fetchReaderNotes,
  fetchSharePulse,
  publishShare,
  revokeShare,
  type ReaderNote,
  type SharePulse,
} from '@/features/reader/lib/share-actions'
import { shareUrl } from '@/features/reader/lib/share-book'
import { totalWordCount } from '@/features/reader/lib/compile-book'
import type { Project } from '@/types'

/**
 * Publish a read-only copy for beta readers. The link is the access
 * control — unguessable, revocable, and stable across updates so a sent
 * link keeps working when the draft improves.
 */
export function ShareBookDialog({
  open,
  onOpenChange,
  project,
  onProjectChange,
  book,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project
  onProjectChange: (project: Project) => void
  book: BookChapter[]
}) {
  const { toast } = useToast()
  const [working, setWorking] = useState<'publish' | 'revoke' | null>(null)
  const [copied, setCopied] = useState(false)
  const [notes, setNotes] = useState<ReaderNote[] | null>(null)
  const [pulse, setPulse] = useState<SharePulse | null>(null)

  const shared = Boolean(project.shareId)
  const words = totalWordCount(book)

  // The suggestion box empties onto the desk whenever the dialog opens on
  // a live share. Failure is quiet — the box simply shows as unavailable.
  // The reset happens during render (house pattern); the effect only
  // subscribes to the fetch.
  const notesKey = open && project.shareId ? project.shareId : ''
  const [loadedKey, setLoadedKey] = useState('')
  if (loadedKey !== notesKey) {
    setLoadedKey(notesKey)
    setNotes(null)
    setPulse(null)
  }
  useEffect(() => {
    if (!notesKey) return
    let cancelled = false
    fetchReaderNotes(notesKey)
      .then((fetched) => {
        if (!cancelled) setNotes(fetched)
      })
      .catch(() => {
        if (!cancelled) setNotes([])
      })
    fetchSharePulse(notesKey)
      .then((p) => {
        if (!cancelled) setPulse(p)
      })
      .catch(() => {
        if (!cancelled) setPulse(null)
      })
    return () => {
      cancelled = true
    }
  }, [notesKey])

  async function handleDeleteNote(noteId: string) {
    if (!project.shareId) return
    setNotes((current) => current?.filter((n) => n.id !== noteId) ?? null)
    try {
      await deleteReaderNote(project.shareId, noteId)
    } catch {
      toast({ title: 'Could not delete the note', variant: 'destructive' })
    }
  }

  async function handlePublish() {
    setWorking('publish')
    try {
      const shareId = await publishShare(project, book)
      onProjectChange({ ...project, shareId, shareChapterCount: book.length })
      toast({ title: shared ? 'Shared copy updated' : 'Your book is shareable' })
    } catch {
      toast({ title: 'Could not publish the copy', variant: 'destructive' })
    } finally {
      setWorking(null)
    }
  }

  async function handleRevoke() {
    setWorking('revoke')
    try {
      await revokeShare(project)
      onProjectChange({ ...project, shareId: null, shareChapterCount: 0 })
      toast({ title: 'Sharing stopped — the link no longer works' })
    } catch {
      toast({ title: 'Could not stop sharing', variant: 'destructive' })
    } finally {
      setWorking(null)
    }
  }

  async function handleCopy() {
    if (!project.shareId) return
    await navigator.clipboard.writeText(shareUrl(project.shareId))
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share with beta readers</DialogTitle>
          <DialogDescription>
            Publishes a read-only copy ({words.toLocaleString()} words) that anyone with the
            link can read in their browser — no account, no install. Your local book stays
            yours; the copy only changes when you update it.
          </DialogDescription>
        </DialogHeader>

        {shared && project.shareId && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={shareUrl(project.shareId)}
                aria-label="The share link"
                className="text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                aria-label="Copy the share link"
                onClick={() => void handleCopy()}
              >
                {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The link is the key: anyone holding it can read. Updating keeps the same link;
              stopping kills it everywhere at once.
            </p>
            {pulse && pulse.opens > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Eye className="size-3.5" />
                Opened {pulse.opens} {pulse.opens === 1 ? 'time' : 'times'}
                {pulse.lastOpenedAt && <> · last {new Date(pulse.lastOpenedAt).toLocaleDateString()}</>}
              </p>
            )}
          </div>
        )}

        {shared && notes !== null && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <MessageSquare className="size-3.5" /> Reader notes
              <span className="text-muted-foreground">({notes.length})</span>
            </p>
            {notes.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                None yet. Readers can leave you notes from the shared page.
              </p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-md border border-border bg-muted/40 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        {n.quote && (
                          <p className="truncate text-xs italic text-muted-foreground">
                            “{n.quote}”
                          </p>
                        )}
                        <p className="whitespace-pre-wrap text-sm">{n.note}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {n.name || 'Anonymous'} · {book[n.chapterIndex]?.title ?? 'Unknown chapter'}
                          {n.createdAt > 0 && <> · {new Date(n.createdAt).toLocaleDateString()}</>}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        aria-label="Delete this note"
                        onClick={() => void handleDeleteNote(n.id)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {shared && (
            <Button
              variant="outline"
              onClick={() => void handleRevoke()}
              disabled={working !== null}
            >
              {working === 'revoke' && <Loader2 className="size-4 animate-spin" />} Stop sharing
            </Button>
          )}
          <Button onClick={() => void handlePublish()} disabled={working !== null || book.length === 0}>
            {working === 'publish' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Globe className="size-4" />
            )}
            {shared ? 'Update the copy' : 'Publish read-only copy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
