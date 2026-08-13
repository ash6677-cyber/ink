import { Timer, X } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { appendSprintResult } from '@/features/stats/lib/daily-digest'
import { cn } from '@/lib/utils'

/**
 * A writing sprint: a container for the next half hour, not a judgement.
 *
 * The timer runs on the book's live word count, so it measures what
 * actually happened rather than keystrokes. Deleting mid-sprint is allowed
 * and normal — the count shown is net words gained, floored at zero,
 * because "you wrote minus forty words" is a sentence that helps nobody.
 * Results land in the day's stats automatically (autosave already logs
 * progress); the sprint itself is deliberately stateless — close the app
 * mid-sprint and nothing nags later.
 */

interface SprintState {
  endsAt: number
  totalMs: number
  startWords: number
  goal: number | null
}

const PRESETS = [15, 25, 45]

function formatLeft(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function SprintControl({
  bookWordCount,
  projectId,
}: {
  bookWordCount: number
  projectId?: string | null
}) {
  const [setupOpen, setSetupOpen] = useState(false)
  const [minutes, setMinutes] = useState(25)
  const [goalDraft, setGoalDraft] = useState('')
  const [sprint, setSprint] = useState<SprintState | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [summary, setSummary] = useState<{ words: number; minutes: number; goal: number | null } | null>(null)
  const wordsRef = useRef(bookWordCount)
  wordsRef.current = bookWordCount

  useEffect(() => {
    if (!sprint) return
    const interval = setInterval(() => setNowTick(Date.now()), 500)
    return () => clearInterval(interval)
  }, [sprint])

  const msLeft = sprint ? sprint.endsAt - nowTick : 0
  const gained = sprint ? Math.max(0, bookWordCount - sprint.startWords) : 0

  // Time's up: close out during render-adjacent effect, not mid-render.
  useEffect(() => {
    if (!sprint || msLeft > 0) return
    finish(sprint)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprint, msLeft <= 0])

  function finish(state: SprintState) {
    const words = Math.max(0, wordsRef.current - state.startWords)
    const elapsed = Math.min(state.totalMs, state.totalMs - (state.endsAt - Date.now()))
    const minutes = Math.max(1, Math.round(elapsed / 60000))
    setSummary({ words, minutes: Math.round(state.totalMs / 60000), goal: state.goal })
    setSprint(null)
    // The outcome (not the sprint itself) is kept, so the day's digest can
    // name your best sprint. Storage failures are non-events here.
    try {
      appendSprintResult(window.localStorage, {
        words,
        minutes,
        endedAt: Date.now(),
        projectId: projectId ?? null,
      })
    } catch {
      /* private mode or full storage — the sprint still counted in stats */
    }
  }

  function start() {
    const clamped = Math.min(120, Math.max(1, Math.round(minutes)))
    const goal = Number.parseInt(goalDraft, 10)
    setSprint({
      endsAt: Date.now() + clamped * 60000,
      totalMs: clamped * 60000,
      startWords: bookWordCount,
      goal: Number.isFinite(goal) && goal > 0 ? goal : null,
    })
    setSetupOpen(false)
  }

  if (sprint) {
    const urgent = msLeft <= 60000
    return (
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs tabular-nums',
          urgent ? 'border-amber-500/60 text-amber-500' : 'border-border text-muted-foreground',
        )}
      >
        <Timer className="size-3.5" aria-hidden />
        <span aria-label="Sprint time remaining">{formatLeft(msLeft)}</span>
        <span className="text-foreground">
          +{gained.toLocaleString()}
          {sprint.goal ? ` / ${sprint.goal.toLocaleString()}` : ''} words
        </span>
        <button
          type="button"
          onClick={() => finish(sprint)}
          aria-label="End the sprint now"
          className="touch-target ml-0.5 flex size-4 items-center justify-center rounded hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      </div>
    )
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="hidden gap-1.5 text-muted-foreground 2xl:inline-flex"
        onClick={() => setSetupOpen(true)}
        aria-label="Start a writing sprint"
      >
        <Timer className="size-3.5" /> Sprint
      </Button>

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Writing sprint</DialogTitle>
            <DialogDescription>
              A timer and a count. Words land in your stats either way.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Minutes</Label>
              <div className="flex gap-1.5">
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setMinutes(preset)}
                    className={cn(
                      'flex-1 rounded-md border px-2 py-1.5 text-sm pointer-coarse:min-h-11',
                      minutes === preset
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {preset}
                  </button>
                ))}
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  aria-label="Sprint minutes"
                  className="w-16 text-center"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sprint-goal">Word goal (optional)</Label>
              <Input
                id="sprint-goal"
                type="number"
                min={0}
                placeholder="e.g. 500"
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={start}>Start sprint</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={summary !== null} onOpenChange={(open) => !open && setSummary(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>
              {summary && summary.goal !== null
                ? summary.words >= summary.goal
                  ? 'Goal met.'
                  : 'Sprint done.'
                : 'Sprint done.'}
            </DialogTitle>
            <DialogDescription>
              {summary && (
                <>
                  {summary.words.toLocaleString()} words in {summary.minutes}{' '}
                  {summary.minutes === 1 ? 'minute' : 'minutes'}
                  {summary.goal !== null && ` — the goal was ${summary.goal.toLocaleString()}`}.
                  {summary.words > 0 &&
                    ` That's ${Math.round(summary.words / Math.max(1, summary.minutes))} a minute.`}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setSummary(null)}>Back to the page</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
