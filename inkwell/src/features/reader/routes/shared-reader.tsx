import { BookX, Feather } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { BookStage } from '@/features/reader/components/book-stage'
import { bookFromShared, fetchShare, type FetchedShare } from '@/features/reader/lib/share-book'

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

  useEffect(() => {
    let cancelled = false
    void fetchShare(shareId).then((result) => {
      if (!cancelled) setShare(result)
    })
    return () => {
      cancelled = true
    }
  }, [shareId])

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
    <div className="book-reader flex h-dvh flex-col bg-gradient-to-b from-background to-muted/30">
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate font-serif text-base font-semibold">{share.meta.title}</h1>
          {share.meta.author && (
            <p className="truncate text-xs text-muted-foreground">{share.meta.author}</p>
          )}
        </div>
        <p className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Feather className="size-3.5" aria-hidden /> Shared from INKWELL
        </p>
      </header>

      <BookStage book={book} title={share.meta.title} author={share.meta.author} projectId="" />
    </div>
  )
}
