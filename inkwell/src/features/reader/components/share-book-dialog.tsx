import { Check, Copy, Globe, Loader2 } from 'lucide-react'
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
import { useToast } from '@/components/ui/use-toast'
import type { BookChapter } from '@/features/reader/lib/compile-book'
import { publishShare, revokeShare } from '@/features/reader/lib/share-actions'
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

  const shared = Boolean(project.shareId)
  const words = totalWordCount(book)

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
