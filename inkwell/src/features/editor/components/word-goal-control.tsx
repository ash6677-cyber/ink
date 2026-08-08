import { Target } from 'lucide-react'
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
import { DEFAULT_DAILY_TARGET, useStatsStore } from '@/stores/stats-store'

/**
 * The daily goal, editable where the writing happens. It was always visible
 * on the Stats page, but changing it meant leaving the manuscript — three
 * rooms away from the sentence that made you want a bigger (or kinder)
 * target. One click opens it, Enter saves it, and Stats reads the same
 * store so the two can never disagree.
 */
export function WordGoalControl({ projectId }: { projectId: string }) {
  const goals = useStatsStore((s) => s.goals)
  const setDailyTarget = useStatsStore((s) => s.setDailyTarget)

  const goal =
    goals.find((g) => g.projectId === projectId) ?? goals.find((g) => g.projectId === null)
  const target = goal?.dailyWordTarget ?? DEFAULT_DAILY_TARGET

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  async function save() {
    const parsed = Number.parseInt(draft, 10)
    if (!Number.isFinite(parsed) || parsed < 0) return
    await setDailyTarget(projectId, parsed)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(String(target))
          setOpen(true)
        }}
        aria-label="Edit your daily word goal"
        title="Your daily word goal — click to change it"
        className="mr-2 hidden items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground sm:inline-flex pointer-coarse:min-h-11"
      >
        <Target className="size-3" aria-hidden />
        {target.toLocaleString()}/day
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Daily word goal</DialogTitle>
            <DialogDescription>
              For this book. The Stats page tracks the same number.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            type="number"
            min={0}
            step={50}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
            }}
            aria-label="Daily word goal"
          />
          <DialogFooter>
            <Button onClick={() => void save()}>Save goal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
