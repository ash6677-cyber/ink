import { BookX, Feather, MessageSquarePlus, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { BookStage } from '@/features/reader/components/book-stage'
import { ReaderNoteDialog } from '@/features/reader/components/reader-note-dialog'
import { ReaderThemeToggle } from '@/features/reader/components/reader-theme-toggle'
import {
  bookFromShared,
  fetchShare,
  pingChapterReached,
  pingSharePulse,
  QUOTE_MAX,
  readShareLastSeen,
  readSharedBookmark,
  shouldShowWhatsNew,
  writeShareLastSeen,
  writeSharedBookmark,
  type FetchedShare,
} from '@/features/reader/lib/share-book'
import { useReaderThemeClass } from '@/features/reader/lib/use-reader-theme'
import { cn } from '@/lib/utils'

import '@/features/reader/reader.css'
import { useDocumentTitle } from '@/lib/hooks/use-document-title'

/**
 * The page a beta reader lands on. No account, no SDK, no app chrome —
 * the book, the page-flip, and a quiet line about where it came from.
 * A revoked or mistyped link gets a plain answer, never a spinner that
 * neither ends nor explains.
 */
export function SharedReader() {
  const { shareId = '' } = useParams()
  const [share, setShare] = useState<FetchedShare | null>(null)
  const readerThemeClass = useReaderThemeClass()
  const [chapterIndex, setChapterIndex] = useState(0)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteQuote, setNoteQuote] = useState('')
  // Read before the visit overwrites it: whether this device has been
  // here before, by the share's own clock. Local memory only.
  const [lastSeen] = useState(() => readShareLastSeen(shareId))
  const [whatsNewOpen, setWhatsNewOpen] = useState(true)

  useEffect(() => {
    let cancelled = false
    void fetchShare(shareId).then((result) => {
      if (!cancelled) {
        setShare(result)
        if (result.state === 'found') {
          // A found book counts as an open — ping the pulse (throttled to
          // once an hour per device inside the helper) — and this visit
          // becomes the new "last time" for the what's-new banner.
          pingSharePulse(shareId)
          writeShareLastSeen(shareId, result.meta.updatedAt)
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [shareId])

  const [bookmark] = useState(() => readSharedBookmark(shareId))

  const book = useMemo(
    () => (share?.state === 'found' ? bookFromShared(share.chapters) : []),
    [share],
  )
  useDocumentTitle(share?.state === 'found' ? share.meta.title : 'Shared book')

  if (share === null) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Opening the book…</p>
      </div>
    )
  }

  if (share.state !== 'found') {
    return (
      <div className="flex h-dvh items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center">
          <BookX className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <h1 className="mt-4 text-lg font-semibold">
            {share.state === 'gone' ? 'This book is no longer shared' : 'Couldn’t reach the book'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {share.state === 'gone'
              ? 'The author may have stopped sharing it, or the link may be mistyped. Ask them for a fresh one.'
              : 'Something between you and the shelf failed. Check your connection and reload.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'book-reader book-reader-shared flex h-dvh flex-col bg-gradient-to-b from-background to-muted/30',
        readerThemeClass,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate font-serif text-base font-semibold">{share.meta.title}</h1>
          {share.meta.author && (
            <p className="truncate text-xs text-muted-foreground">{share.meta.author}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Whatever the reader had selected on the page rides along as
              // the quote — where selection works; the field is editable
              // either way.
              setNoteQuote(
                (window.getSelection()?.toString() ?? '').trim().slice(0, QUOTE_MAX),
              )
              setNoteOpen(true)
            }}
          >
            <MessageSquarePlus className="size-3.5" /> Leave a note
          </Button>
          <ReaderThemeToggle />
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground max-sm:hidden">
            <Feather className="size-3.5" aria-hidden /> Shared from INKWELL
          </p>
        </div>
      </header>

      {shouldShowWhatsNew(share.meta, lastSeen) && whatsNewOpen && (
        <div
          className="mx-4 mb-2 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
          data-whats-new
        >
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-medium">Since your last visit:</span> {share.meta.note}
          </p>
          <button
            type="button"
            aria-label="Dismiss what's new"
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => setWhatsNewOpen(false)}
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <BookStage
        coverDataUrl={share.meta.cover}
        book={book}
        title={share.meta.title}
        author={share.meta.author}
        projectId=""
        onChapterChange={setChapterIndex}
        onDeepestChapterChange={(index) => {
          // The anonymous depth tick — counts only, deduped per device.
          // Depth rather than the page under the eye: the right page of a
          // spread counts as reached.
          pingChapterReached(shareId, index)
        }}
        initialPage={bookmark}
        onPageChange={(page) => writeSharedBookmark(shareId, page)}
      />

      <ReaderNoteDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        shareId={shareId}
        chapterIndex={chapterIndex}
        chapterTitle={book[chapterIndex]?.title ?? ''}
        initialQuote={noteQuote}
      />
    </div>
  )
}
