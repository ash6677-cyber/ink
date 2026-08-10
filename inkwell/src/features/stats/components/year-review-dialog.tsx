import { Download, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { renderYearCard } from '@/features/stats/lib/render-year-card'
import { buildYearReview } from '@/features/stats/lib/year-review'
import type { SessionLog } from '@/types'

/**
 * "Year in review" — the year folded into one shareable card. The canvas
 * is the artefact (1080×1350, drawn at share size); the list beside it is
 * the same numbers in honest, screen-readable text.
 */
export function YearReviewDialog({
  sessions,
  authorName,
}: {
  sessions: SessionLog[]
  authorName?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => new Date().getFullYear())
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const thisYear = new Date().getFullYear()
  const review = buildYearReview(sessions, year)
  const lastYearHasWords = buildYearReview(sessions, thisYear - 1).totalWords > 0

  useEffect(() => {
    if (!open) return
    // The dialog's content mounts in a portal one tick after `open` flips,
    // so the canvas may not exist yet when this runs — retry on frames
    // until it does, then draw again once fonts land so the card and the
    // app agree on the serif.
    let raf = 0
    const draw = () => {
      if (canvasRef.current) {
        renderYearCard(canvasRef.current, review, authorName)
      } else {
        raf = requestAnimationFrame(draw)
      }
    }
    draw()
    document.fonts?.ready
      .then(() => {
        if (canvasRef.current) renderYearCard(canvasRef.current, review, authorName)
      })
      .catch(() => undefined)
    return () => cancelAnimationFrame(raf)
  })

  function download() {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inkwell-year-${year}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
        aria-label="Open your year in review"
      >
        <Sparkles className="size-3.5" /> Year in review
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Your {year} in words</DialogTitle>
            <DialogDescription>
              A card worth posting. Numbers from your real session logs — nothing invented.
            </DialogDescription>
          </DialogHeader>

          {lastYearHasWords && (
            <div className="flex gap-1.5">
              {[thisYear, thisYear - 1].map((y) => (
                <Button
                  key={y}
                  variant={year === y ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setYear(y)}
                >
                  {y}
                </Button>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <canvas
              ref={canvasRef}
              aria-label={`Your ${year} writing year card`}
              className="w-full rounded-lg border border-border shadow-lg"
            />
            <dl className="space-y-2 text-sm" data-year-review-stats>
              <div>
                <dt className="text-xs text-muted-foreground">Words written</dt>
                <dd className="font-serif text-xl font-semibold tabular-nums">
                  {review.totalWords.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Days at the desk</dt>
                <dd className="font-serif text-xl font-semibold tabular-nums">
                  {review.daysWritten}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Best streak</dt>
                <dd className="font-serif text-xl font-semibold tabular-nums">
                  {review.longestStreak} {review.longestStreak === 1 ? 'day' : 'days'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Biggest day</dt>
                <dd className="font-serif text-xl font-semibold tabular-nums">
                  {review.biggestDay ? review.biggestDay.words.toLocaleString() : '—'}
                </dd>
              </div>
            </dl>
          </div>

          <DialogFooter>
            <Button onClick={download} className="gap-1.5">
              <Download className="size-4" /> Download PNG
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
