import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { BookView, type ReaderPage } from '@/features/reader/components/book-view'
import { ChapterContent } from '@/features/reader/components/chapter-content'
import { PageSurface, type PageMetrics } from '@/features/reader/components/page-surface'
import type { BookChapter } from '@/features/reader/lib/compile-book'

import '@/features/reader/reader.css'

/** Roughly a trade paperback: height / width. */
const PAGE_ASPECT = 1.52
/** Below this the spread becomes a single page, as on a phone. */
const TWO_PAGE_MIN_WIDTH = 940

function computeMetrics(width: number, height: number, columns: 1 | 2): PageMetrics {
  const availableW = Math.max(240, width - 56)
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
}: {
  book: BookChapter[]
  title: string
  author: string
  /** Used only to look up a local cover for the front page; a shared book
   * passes '' and gets the plain title page. */
  projectId: string
}) {
  const stageRef = useRef<HTMLDivElement | null>(null)
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

  const columns: 1 | 2 = box.width >= TWO_PAGE_MIN_WIDTH ? 2 : 1
  const metrics = useMemo(
    () => computeMetrics(box.width, box.height, columns),
    [box.width, box.height, columns],
  )

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

  return (
    <>
      <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center">
        {ready ? (
          <BookView
            book={book}
            pageCounts={pageCounts}
            metrics={metrics}
            columns={columns}
            pageIndex={pageIndex}
            onPageIndexChange={setPageIndex}
            flatPages={flatPages}
            projectId={projectId}
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
            onClick={() => setPageIndex(Math.max(0, pageIndex - columns))}
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
            onClick={() => setPageIndex(Math.min(flatPages.length - 1, pageIndex + columns))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </footer>
      )}
    </>
  )
}
