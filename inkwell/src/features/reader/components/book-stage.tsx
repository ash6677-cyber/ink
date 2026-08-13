import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  BookView,
  type BookViewHandle,
  type ReaderPage,
} from '@/features/reader/components/book-view'
import { ChapterContent } from '@/features/reader/components/chapter-content'
import { PageSurface, type PageMetrics } from '@/features/reader/components/page-surface'
import type { BookChapter } from '@/features/reader/lib/compile-book'

import '@/features/reader/reader.css'

/** Roughly a trade paperback: height / width. */
const PAGE_ASPECT = 1.52

/**
 * The reference page width the typography was designed at. Smaller pages
 * scale their type down proportionally (floored — see below), so a phone's
 * two-up spread reads like a real paperback held at arm's length instead
 * of desktop type crammed into a miniature page.
 */
const FULL_TYPE_PAGE_WIDTH = 430
const MIN_TYPE_SCALE = 0.66

function computeMetrics(width: number, height: number, columns: 1 | 2): PageMetrics {
  // Small screens give almost everything to the pages; the two-up spread
  // needs the room far more than side margins do.
  const chrome = width < 700 ? 16 : 56
  const availableW = Math.max(240, width - chrome)
  const availableH = Math.max(320, height - 40)
  const pageW = Math.min(availableW / columns, availableH / PAGE_ASPECT)
  const pageH = pageW * PAGE_ASPECT
  return {
    width: Math.floor(pageW),
    height: Math.floor(pageH),
    padTop: Math.round(pageH * 0.072),
    padBottom: Math.round(pageH * 0.086),
    padOuter: Math.round(pageW * 0.108),
    padSpine: Math.round(pageW * 0.128),
  }
}

/**
 * The page-flip book, extracted whole from the Read screen so a *shared*
 * book renders through the exact machinery the writer reads with — same
 * pagination, same page geometry, same turn. One stage, two doors.
 *
 * Data-free on purpose: it takes a compiled book and identity strings, and
 * knows nothing about where they came from (local stores or a share fetch).
 */
export function BookStage({
  book,
  title,
  author,
  projectId,
  coverDataUrl,
  onChapterChange,
  onDeepestChapterChange,
  initialPage,
  onPageChange,
}: {
  book: BookChapter[]
  title: string
  author: string
  /** Used only to look up a local cover for the front page; a shared book
   * passes '' and sends the cover that travelled with the share instead. */
  projectId: string
  /** A vetted cover data URL from a shared book, when there is one. */
  coverDataUrl?: string | null
  /** Fires as reading moves between chapters — the shared reader anchors
   * a beta reader's notes to wherever they currently are. */
  onChapterChange?: (chapterIndex: number) => void
  /** Fires with the deepest chapter visible on the spread — the honest
   * "how far did they get" signal. Distinct from onChapterChange, which
   * names the page under the reader's eye: on a two-page spread the right
   * page can be a chapter deeper than the left. */
  onDeepestChapterChange?: (chapterIndex: number) => void
  /** Where to open — a remembered bookmark. Applied once, when the book is
   * first typeset (it can't land before the pages are measured). */
  initialPage?: number
  /** Fires as the reader turns pages, for saving a bookmark. */
  onPageChange?: (pageIndex: number) => void
}) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<BookViewHandle | null>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const node = stageRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setBox((prev) =>
        Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
          ? prev
          : { width, height },
      )
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Always an open book: two facing pages, scaled to whatever screen this
  // is. One-page mode forced the turn to pivot at a spine the screen didn't
  // show, and every animation built on that geometry read as broken — the
  // sheet needs a facing page to land on, so the facing page is always there.
  const columns: 1 | 2 = 2
  const metrics = useMemo(
    () => computeMetrics(box.width, box.height, columns),
    [box.width, box.height, columns],
  )

  // Type shrinks with the page, floored where it stops being print and
  // starts being squinting.
  const typeScale = Math.max(MIN_TYPE_SCALE, Math.min(1, metrics.width / FULL_TYPE_PAGE_WIDTH))

  // Page counts arrive from hidden measurers, one per chapter — the browser
  // does the pagination via CSS columns and we just read back how many
  // columns the prose spilled into.
  const [pageCounts, setPageCounts] = useState<number[]>([])
  const setChapterCount = useCallback((index: number, count: number) => {
    setPageCounts((prev) => {
      if (prev[index] === count) return prev
      const next = [...prev]
      next[index] = count
      return next
    })
  }, [])

  const flatPages = useMemo(() => {
    // The front page first, then the prose. Tagged rather than a magic index
    // so nothing downstream has to remember that page zero is special.
    const pages: ReaderPage[] = [{ kind: 'front' }]
    book.forEach((_, chapterIndex) => {
      const count = pageCounts[chapterIndex] ?? 0
      for (let localIndex = 0; localIndex < count; localIndex++) {
        pages.push({ kind: 'chapter', chapterIndex, localIndex })
      }
    })
    return pages
  }, [book, pageCounts])

  const [rawPageIndex, setPageIndex] = useState(0)
  // Derived rather than corrected in an effect: re-measuring after a resize
  // can shrink the book, and clamping during render avoids both a cascading
  // re-render and a frame showing an out-of-range page.
  const pageIndex =
    flatPages.length > 0 ? Math.min(rawPageIndex, flatPages.length - 1) : rawPageIndex

  // The front page alone is not a book to read; wait for prose to measure.
  const ready = box.width > 0 && flatPages.length > 1
  const here = flatPages[pageIndex]
  const currentChapter = here?.kind === 'chapter' ? here.chapterIndex : 0
  const progress = flatPages.length > 0 ? (pageIndex + 1) / flatPages.length : 0

  // Jump to a remembered bookmark once, and only once the book has actually
  // typeset enough pages to contain it — before that the target doesn't
  // exist yet. A flag rather than an effect dependency so a later resize
  // can't yank the reader back to the bookmark.
  const [restored, setRestored] = useState(false)
  if (!restored && ready && initialPage && initialPage > 0 && flatPages.length > initialPage) {
    setRestored(true)
    setPageIndex(initialPage)
  }

  useEffect(() => {
    onChapterChange?.(currentChapter)
  }, [currentChapter, onChapterChange])

  // The rightmost visible page's chapter, for depth reporting: a spread
  // whose right page opens the final chapter has reached it, even though
  // the page under the eye is still the one before.
  const lastVisible = flatPages[Math.min(pageIndex + columns - 1, Math.max(0, flatPages.length - 1))]
  const deepestChapter = lastVisible?.kind === 'chapter' ? lastVisible.chapterIndex : currentChapter
  useEffect(() => {
    if (ready) onDeepestChapterChange?.(deepestChapter)
  }, [ready, deepestChapter, onDeepestChapterChange])

  useEffect(() => {
    if (ready) onPageChange?.(pageIndex)
  }, [ready, pageIndex, onPageChange])

  return (
    <>
      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 items-center justify-center"
        style={{ '--page-fit-scale': String(typeScale) } as React.CSSProperties}
      >
        {ready ? (
          <BookView
            ref={viewRef}
            book={book}
            pageCounts={pageCounts}
            metrics={metrics}
            columns={columns}
            pageIndex={pageIndex}
            onPageIndexChange={setPageIndex}
            flatPages={flatPages}
            projectId={projectId}
            coverDataUrl={coverDataUrl}
            title={title}
            author={author}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Typesetting your book…</p>
        )}

        {/* Hidden measurers: the same content, same page geometry, laid out
            once per chapter purely to count how many pages it becomes. */}
        {box.width > 0 &&
          book.map((chapter, index) => (
            <div
              key={chapter.id}
              className="book-measure"
              style={{ width: metrics.width, height: metrics.height }}
              aria-hidden="true"
            >
              <PageSurface
                metrics={metrics}
                pageIndex={0}
                side="right"
                onPageCount={(count) => setChapterCount(index, count)}
              >
                <ChapterContent chapter={chapter} />
              </PageSurface>
            </div>
          ))}
      </div>

      {ready && (
        <footer
          data-edge-chrome
          className="pad-safe-bottom flex shrink-0 items-center gap-3 px-5 pb-4 pt-1"
        >
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 max-sm:size-11 pointer-coarse:size-11"
            aria-label="Previous page"
            disabled={pageIndex === 0}
            onClick={() => {
              // Through the same spring-driven curl as a swipe — a button
              // press earns the full page turn, not an instant swap. The
              // fallback only fires if no leaf can exist (view not ready).
              if (!viewRef.current?.turn('backward'))
                setPageIndex(Math.max(0, pageIndex - columns))
            }}
          >
            <ChevronLeft className="size-4" />
          </Button>

          <div className="min-w-0 flex-1">
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <p className="mt-1.5 truncate text-center text-[11px] text-muted-foreground">
              {here?.kind === 'front'
                ? title
                : `${book[currentChapter]?.title} · page ${pageIndex} of ${flatPages.length - 1}`}
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 max-sm:size-11 pointer-coarse:size-11"
            aria-label="Next page"
            disabled={pageIndex + columns >= flatPages.length}
            onClick={() => {
              if (!viewRef.current?.turn('forward'))
                setPageIndex(Math.min(flatPages.length - 1, pageIndex + columns))
            }}
          >
            <ChevronRight className="size-4" />
          </Button>
        </footer>
      )}
    </>
  )
}
