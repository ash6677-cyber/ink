import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { ChapterContent } from '@/features/reader/components/chapter-content'
import { CurlLeaf, type CurlHandle } from '@/features/reader/components/curl-leaf'
import { PageSurface, type PageMetrics } from '@/features/reader/components/page-surface'
import type { BookChapter } from '@/features/reader/lib/compile-book'
import { SEGMENT_COUNT } from '@/features/reader/lib/curl-geometry'
import { criticalDamping, isSpringAtRest, stepSpring } from '@/features/reader/lib/spring'
import { cn } from '@/lib/utils'
import { FrontPage } from '@/features/reader/components/front-page'

export type ReaderPage =
  | { kind: 'front' }
  | { kind: 'chapter'; chapterIndex: number; localIndex: number }

/** Past this fraction of a turn, releasing completes it instead of snapping back. */
const COMMIT_THRESHOLD = 0.5
/**
 * A flick this fast completes the turn from any angle, in turns per second.
 * Measured in progress units rather than pixels so a phone and a wide
 * desktop spread need the same gesture rather than the same distance.
 */
const FLICK_VELOCITY = 1.6

/**
 * Springs for the two ways a turn can end.
 *
 * Completing is a page falling — it should feel weighted and unhurried.
 * Cancelling is the spine pushing back, which is a snappier, stiffer
 * motion. Both are critically damped: a page settling closed must not
 * bounce open again.
 */
const COMPLETE_SPRING = { stiffness: 130, damping: criticalDamping(130) }
const CANCEL_SPRING = { stiffness: 210, damping: criticalDamping(210) }

/** Initial speed given to a keyboard or button turn, in turns per second.
 * Starting from a dead stop is what made those feel mechanical. */
/** A finger never lands perfectly still, and a tap is over quickly. */
const TAP_SLOP_PX = 10
const TAP_MAX_MS = 350

const NUDGE_VELOCITY = 1.15

type Direction = 'forward' | 'backward'

interface TurnState {
  direction: Direction
  /** Page index shown on the face that starts flat on the right. */
  frontPage: number
  /** Page index on the reverse, which lands on the left. */
  backPage: number
}

/** Lets the stage's footer buttons run the same animated turn as a swipe. */
export interface BookViewHandle {
  turn: (direction: Direction) => boolean
}

export const BookView = forwardRef<
  BookViewHandle,
  {
    book: BookChapter[]
    pageCounts: number[]
    metrics: PageMetrics
    columns: 1 | 2
    pageIndex: number
    onPageIndexChange: (index: number) => void
    flatPages: ReaderPage[]
    projectId: string
    title: string
    author: string
  }
>(function BookView(
  {
    book,
    pageCounts,
    metrics,
    columns,
    pageIndex,
    onPageIndexChange,
    flatPages,
    projectId,
    title,
    author,
  },
  handleRef,
) {
  const totalPages = flatPages.length
  const curlRef = useRef<CurlHandle | null>(null)
  const spineShadowRef = useRef<HTMLDivElement | null>(null)

  const [turn, setTurn] = useState<TurnState | null>(null)

  // Live drag values are kept in refs, never state: a pointermove that
  // triggers a React render can't hold a frame budget at 120Hz, and the
  // turn has to stay glued to the cursor.
  const progressRef = useRef(0)
  const draggingRef = useRef(false)
  const pointerStartRef = useRef(0)
  const lastMoveRef = useRef({ x: 0, t: 0 })
  /** When the press began, so a tap can be told from a very slow drag. */
  const pressStartRef = useRef(0)
  const velocityRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const turnRef = useRef<TurnState | null>(null)

  // The left page of the current spread. In two-column mode a spread always
  // starts on an even page so the pair stays stable as you turn.
  const leftPage = columns === 2 ? pageIndex - (pageIndex % 2) : pageIndex
  const rightPage = columns === 2 ? leftPage + 1 : leftPage

  const canGoForward = (columns === 2 ? leftPage + 2 : leftPage + 1) < totalPages
  const canGoBackward = leftPage > 0

  const paint = useCallback((progress: number) => {
    // The sheet bends itself: every segment gets its own angle, position
    // and shading, so the surface is curved rather than a rotating plane.
    curlRef.current?.setProgress(progress)

    // The lifted sheet casts onto the spread underneath, strongest when
    // it stands upright.
    const spine = spineShadowRef.current
    if (spine) spine.style.opacity = String(Math.sin(progress * Math.PI) * 0.3)
  }, [])

  const finishTurn = useCallback(
    (committed: boolean) => {
      const state = turnRef.current
      turnRef.current = null
      setTurn(null)
      progressRef.current = 0
      if (!state || !committed) return
      const step = columns === 2 ? 2 : 1
      onPageIndexChange(
        state.direction === 'forward'
          ? Math.min(totalPages - 1, leftPage + step)
          : Math.max(0, leftPage - step),
      )
    },
    [columns, leftPage, onPageIndexChange, totalPages],
  )

  /**
   * Springs the leaf to 0 or 1 and then commits, without React in the loop.
   *
   * Seeded with the speed the sheet already had, so releasing mid-flick
   * continues the motion instead of stopping dead and starting a fresh
   * animation — which is what made the old fixed-duration ease feel stiff
   * no matter how it was tuned.
   */
  const settle = useCallback(
    (target: 0 | 1, initialVelocity = 0) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      // Which end of the rotation counts as "turned" depends on direction:
      // a forward turn finishes lying open on the left (1), a backward turn
      // finishes lying flat on the right (0).
      const committedAt = turnRef.current?.direction === 'backward' ? 0 : 1
      const committed = target === committedAt
      const config = committed ? COMPLETE_SPRING : CANCEL_SPRING

      let state = { value: progressRef.current, velocity: initialVelocity }
      if (isSpringAtRest(state, target)) {
        progressRef.current = target
        paint(target)
        finishTurn(committed)
        return
      }

      let last = performance.now()
      const step = (now: number) => {
        const dt = (now - last) / 1000
        last = now
        state = stepSpring(state, target, dt, config)

        if (isSpringAtRest(state, target)) {
          progressRef.current = target
          paint(target)
          rafRef.current = null
          finishTurn(committed)
          return
        }

        // Clamped for painting only: the spring may momentarily reach past
        // an end, and a page does not rotate beyond flat.
        progressRef.current = state.value
        paint(Math.max(0, Math.min(1, state.value)))
        rafRef.current = requestAnimationFrame(step)
      }
      rafRef.current = requestAnimationFrame(step)
    },
    [finishTurn, paint],
  )

  const beginTurn = useCallback(
    (direction: Direction): boolean => {
      if (turnRef.current) return false
      if (direction === 'forward' && !canGoForward) return false
      if (direction === 'backward' && !canGoBackward) return false

      const state: TurnState =
        direction === 'forward'
          ? {
              direction,
              frontPage: columns === 2 ? rightPage : leftPage,
              backPage: columns === 2 ? leftPage + 2 : leftPage + 1,
            }
          : {
              direction,
              frontPage: columns === 2 ? leftPage - 1 : leftPage - 1,
              backPage: columns === 2 ? leftPage : leftPage,
            }

      turnRef.current = state
      setTurn(state)
      // Backward turns start lying open on the left and rotate closed.
      progressRef.current = direction === 'forward' ? 0 : 1
      return true
    },
    [canGoBackward, canGoForward, columns, leftPage, rightPage],
  )

  // Paint the starting angle as soon as the leaf mounts, so a backward turn
  // doesn't flash at 0deg (flat on the right) for a frame before jumping.
  useEffect(() => {
    if (turn) paint(progressRef.current)
  }, [turn, paint])

  const jump = useCallback(
    (direction: Direction): boolean => {
      // A tap while a sheet is already in the air is handled by ignoring
      // it — NOT by reporting failure. Reporting failure here made the
      // stage's fallback do a raw index swap mid-flight, and the airborne
      // turn's commit then landed on top of it with stale numbers: the
      // page visibly snapped backward. One turn at a time, like a book.
      if (turnRef.current) return true
      // Someone who has asked their device to reduce motion gets the page,
      // not the theatre: an immediate turn with no sheet in flight.
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        if (direction === 'forward' ? !canGoForward : !canGoBackward) return false
        const step = columns === 2 ? 2 : 1
        onPageIndexChange(
          direction === 'forward'
            ? Math.min(totalPages - 1, leftPage + step)
            : Math.max(0, leftPage - step),
        )
        return true
      }
      if (!beginTurn(direction)) return false
      // Given a push rather than released from rest, so a keyboard turn has
      // the same weight as a thrown one instead of creeping into motion.
      const forward = direction === 'forward'
      requestAnimationFrame(() =>
        settle(forward ? 1 : 0, forward ? NUDGE_VELOCITY : -NUDGE_VELOCITY),
      )
      return true
    },
    [
      beginTurn,
      canGoBackward,
      canGoForward,
      columns,
      leftPage,
      onPageIndexChange,
      settle,
      totalPages,
    ],
  )

  useImperativeHandle(handleRef, () => ({ turn: jump }), [jump])

  /**
   * How much of the left edge belongs to the operating system.
   *
   * iOS starts its interactive back gesture from the very edge of the screen,
   * and Android's is the same idea. A page-turn drag beginning in that strip
   * is a fight the app cannot win and should not pick: the writer gets a
   * half-turned page and a half-dismissed screen. Turning the page still
   * works from anywhere else, including a tap.
   */
  const OS_EDGE_PX = 24

  function handlePointerDown(event: React.PointerEvent) {
    if (event.button !== 0) return
    if (event.pointerType !== 'mouse' && event.clientX <= OS_EDGE_PX) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const relative = (event.clientX - bounds.left) / bounds.width
    const direction: Direction = relative > 0.5 ? 'forward' : 'backward'
    if (!beginTurn(direction)) return

    draggingRef.current = true
    pointerStartRef.current = event.clientX
    pressStartRef.current = performance.now()
    lastMoveRef.current = { x: event.clientX, t: performance.now() }
    velocityRef.current = 0
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (!draggingRef.current || !turnRef.current) return

    const dx = event.clientX - pointerStartRef.current
    const base = turnRef.current.direction === 'forward' ? 0 : 1
    const next = Math.max(0, Math.min(1, base - dx / metrics.width))

    // Velocity in turns per second, which is the unit the spring wants, so
    // the sheet leaves the finger at exactly the speed it was moving. A
    // little smoothing because a raw last-two-events reading is noisy enough
    // to misjudge a flick.
    const now = performance.now()
    const dt = now - lastMoveRef.current.t
    if (dt > 0) {
      const sample = ((next - progressRef.current) / dt) * 1000
      velocityRef.current = velocityRef.current * 0.7 + sample * 0.3
      lastMoveRef.current = { x: event.clientX, t: now }
    }

    progressRef.current = next

    // Painting is deferred to the next frame rather than done here. A
    // pointer can fire well above the display's refresh rate — and coalesced
    // events arrive in bursts — so painting per event meant doing the work
    // two or three times for a single frame that only shows the last one.
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        paint(progressRef.current)
      })
    }
  }

  function handlePointerUp(event: React.PointerEvent) {
    if (!draggingRef.current || !turnRef.current) return
    draggingRef.current = false
    try {
      ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    } catch {
      // Capture can already be gone if the pointer left the window.
    }

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    const forward = turnRef.current.direction === 'forward'
    const progress = progressRef.current
    // Now in turns per second: positive means progress is rising, which is
    // the direction a forward turn completes in either case.
    const velocity = velocityRef.current

    // A decisive flick wins over position — a page thrown from barely lifted
    // still goes over.
    const flickedComplete = forward ? velocity > FLICK_VELOCITY : velocity < -FLICK_VELOCITY
    const flickedCancel = forward ? velocity < -FLICK_VELOCITY : velocity > FLICK_VELOCITY

    // A tap is not a failed drag.
    //
    // Dragging a page across is the lovely gesture; tapping the side of the
    // page is the one people actually use, and every e-reader ever made
    // turns on it. Without this, a tap began a turn, moved it nowhere, and
    // settled it back — so the page simply refused to turn for anyone who
    // did not think to swipe.
    const travelled = Math.abs(event.clientX - pointerStartRef.current)
    const held = performance.now() - pressStartRef.current
    const tapped = travelled < TAP_SLOP_PX && held < TAP_MAX_MS

    let target: 0 | 1
    if (tapped) target = forward ? 1 : 0
    else if (flickedComplete) target = forward ? 1 : 0
    else if (flickedCancel) target = forward ? 0 : 1
    else if (forward) target = progress > COMMIT_THRESHOLD ? 1 : 0
    else target = progress < 1 - COMMIT_THRESHOLD ? 0 : 1

    // Carried straight into the spring, so the release is continuous with
    // the drag rather than a new animation starting from rest.
    settle(target, velocity)
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault()
        jump('forward')
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        jump('backward')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jump])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const renderPage = useCallback(
    (index: number, side: 'left' | 'right') => {
      const page = flatPages[index]
      if (!page) return <div className="book-page book-page-blank" style={{ width: metrics.width, height: metrics.height }} />
      if (page.kind === 'front') {
        return (
          <FrontPage projectId={projectId} title={title} author={author} metrics={metrics} />
        )
      }
      return (
        <PageSurface metrics={metrics} pageIndex={page.localIndex} side={side}>
          <ChapterContent chapter={book[page.chapterIndex]} />
        </PageSurface>
      )
    },
    [book, flatPages, metrics, projectId, title, author],
  )

  // The front page carries no folio, and the first page of prose is page one
  // — which is how a printed book counts, and why this is not `index + 1`.
  const pageNumberFor = (index: number) =>
    index > 0 && index < totalPages ? index : null

  // While a sheet is lifting, the page it uncovers must already be painted
  // underneath — otherwise you'd see the table through the gap.
  const underRight = turn?.direction === 'forward' ? leftPage + 3 : rightPage
  const underLeft = turn?.direction === 'backward' ? leftPage - 2 : leftPage
  // Single-page mode has its own answer: a forward turn lifts the current
  // page, so the DESTINATION must already be painted beneath it. Painting
  // the current page there (the old behaviour) made every turn look like it
  // opened and snapped shut — the sheet flew away only to reveal an
  // identical page, which then swapped abruptly at the end.
  const underSingle = turn?.direction === 'forward' ? leftPage + 1 : leftPage

  void pageCounts

  return (
    <div
      className={cn('book-stage', columns === 1 && 'book-stage-single')}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ width: metrics.width * columns, height: metrics.height }}
    >
      {columns === 2 && (
        <div className="book-side book-side-left">
          {renderPage(underLeft, 'left')}
          <span className="book-folio book-folio-left">{pageNumberFor(underLeft)}</span>
        </div>
      )}

      <div className="book-side book-side-right">
        {renderPage(columns === 2 ? underRight : underSingle, columns === 2 ? 'right' : 'left')}
        <span className="book-folio book-folio-right">
          {pageNumberFor(columns === 2 ? underRight : underSingle)}
        </span>
      </div>

      <div ref={spineShadowRef} className="book-spine-shadow" style={{ opacity: 0 }} />
      {columns === 2 && <div className="book-gutter" />}

      {turn && (
        <div className="book-leaf-anchor" style={{ left: columns === 2 ? metrics.width : 0 }}>
          <CurlLeaf
            ref={curlRef}
            width={metrics.width}
            height={metrics.height}
            // One page on screen means no facing page for a spine-pivoted
            // sheet to land on — the whole second half of that turn happens
            // off-screen. Single-column mode therefore flips a flat sheet
            // about its own centre, every frame on the reader's page, on
            // every engine. The full segmented bend belongs to the spread.
            count={columns === 1 ? 1 : SEGMENT_COUNT}
            centerPivot={columns === 1}
            front={
              <>
                {renderPage(turn.frontPage, 'right')}
                <span className="book-folio book-folio-right">
                  {pageNumberFor(turn.frontPage)}
                </span>
              </>
            }
            back={
              <>
                {renderPage(turn.backPage, 'left')}
                <span className="book-folio book-folio-left">{pageNumberFor(turn.backPage)}</span>
              </>
            }
          />
        </div>
      )}
    </div>
  )
})
