import { chapterProgress, ringStroke } from '@/features/editor/lib/chapter-target'
import { cn } from '@/lib/utils'

/**
 * The little progress ring beside a chapter with a word target: fills as
 * the chapter grows, turns success-green once the target is met. Renders
 * nothing when the chapter has no usable target, so target-less chapters
 * look exactly as they always did.
 */
export function ChapterTargetRing({
  wordCount,
  target,
}: {
  wordCount: number
  target: number | null | undefined
}) {
  const progress = chapterProgress(wordCount, target)
  if (!progress) return null

  const radius = 5.5
  const { circumference, dash } = ringStroke(progress.fraction, radius)
  const label = progress.met
    ? `Target met — ${wordCount.toLocaleString()} of ${target?.toLocaleString()} words (${progress.percent}%)`
    : `${wordCount.toLocaleString()} of ${target?.toLocaleString()} words — ${progress.remaining.toLocaleString()} to go`

  return (
    <span title={label} className="flex shrink-0 items-center" data-chapter-target-ring>
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        role="img"
        aria-label={label}
        className="-rotate-90"
      >
        <circle
          cx="7"
          cy="7"
          r={radius}
          fill="none"
          strokeWidth="2"
          className="stroke-border"
        />
        <circle
          cx="7"
          cy="7"
          r={radius}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className={cn(progress.met ? 'stroke-success' : 'stroke-primary')}
        />
      </svg>
    </span>
  )
}
