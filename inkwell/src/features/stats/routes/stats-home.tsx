import { deadlineVerdict, project as projectFinish } from '@/features/stats/lib/projections'
import { BarChart3, Flame, PenLine, Target } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'
import { useProjectStore } from '@/stores/project-store'
import {
  currentStreak,
  dailyTotals,
  DEFAULT_DAILY_TARGET,
  useStatsStore,
  wordsToday,
  type DayTotal,
} from '@/stores/stats-store'
import { ProseReportPanel } from '@/features/stats/components/prose-report-panel'
import { cn } from '@/lib/utils'
import { useDocumentTitle } from '@/lib/hooks/use-document-title'

const CHART_DAYS = 30

const dayLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Flame
  label: string
  value: string
  hint: string
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" strokeWidth={1.75} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-3 font-serif text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </Card>
  )
}

function DayChart({ totals, target }: { totals: DayTotal[]; target: number }) {
  // Scale against the tallest bar, but never let the target line sit off the
  // top of the chart — otherwise a light month makes the goal look reached.
  const peak = Math.max(target, ...totals.map((t) => t.words), 1)

  return (
    <div>
      {/* The positioning context is the bar track alone — if it included the
          date labels below, the target line would be drawn low enough that a
          510-word day would appear to clear a 500 target by a wide margin. */}
      <div className="relative h-44">
        {target > 0 && (
          <div
            // Anchored by `top`, so the 1px border sits exactly on the target
            // value. Anchoring by `bottom` would put the box's lower edge
            // there and draw the line a pixel high.
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-primary/60"
            style={{ top: `${(1 - target / peak) * 100}%` }}
          >
            <span className="absolute -top-2 right-0 bg-card px-1 text-[10px] font-medium text-primary">
              {target.toLocaleString()}
            </span>
          </div>
        )}
        <div className="flex h-full items-end gap-[3px]">
          {totals.map((total) => {
            const met = target > 0 && total.words >= target
            return (
              <div
                key={total.day}
                title={`${dayLabel.format(total.day)} — ${total.words.toLocaleString()} words`}
                className={cn(
                  'min-h-[2px] flex-1 rounded-t-sm transition-[height] duration-300',
                  met
                    ? 'bg-emerald-500/85'
                    : total.words > 0
                      ? 'bg-primary/60'
                      : 'bg-muted-foreground/15',
                )}
                style={{
                  height: `${Math.max((total.words / peak) * 100, total.words > 0 ? 3 : 1)}%`,
                }}
              />
            )
          })}
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{dayLabel.format(totals[0].day)}</span>
        <span>{dayLabel.format(totals[totals.length - 1].day)}</span>
      </div>
    </div>
  )
}

export function StatsHome() {
  useDocumentTitle('Stats')
  const { sessions, status, loadAll, setDailyTarget, setDeadline, goalFor } = useStatsStore()
  const { projects, wordCounts, fetchProjects } = useProjectStore()
  const { toast } = useToast()

  // The nav rail carries the open book from screen to screen via `?project=`;
  // Stats honoring it is what makes "set a goal in the editor, see it here"
  // land on the same book instead of the all-projects rollup.
  const [searchParams] = useSearchParams()
  const [scope, setScope] = useState(searchParams.get('project') ?? 'all')
  // Once per mount: projections work at day scale, and the purity rule is
  // right that a fresh Date.now() every render is a re-render loop waiting
  // to happen.
  const [now] = useState(() => Date.now())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadAll()
    fetchProjects()
  }, [loadAll, fetchProjects])

  const scopeId = scope === 'all' ? null : scope
  const target = goalFor(scopeId)?.dailyWordTarget ?? DEFAULT_DAILY_TARGET

  // The draft is re-seeded whenever the scope or the *stored* target changes,
  // adjusted during render rather than in an effect so typing is never
  // clobbered by a re-render.
  const targetKey = `${scope}:${target}`
  const [draftKey, setDraftKey] = useState(targetKey)
  const [draft, setDraft] = useState(String(target))
  if (draftKey !== targetKey) {
    setDraftKey(targetKey)
    setDraft(String(target))
  }

  const totals = dailyTotals(sessions, CHART_DAYS, scopeId ?? undefined)
  const today = wordsToday(totals)
  const streak = currentStreak(totals, target)
  const monthTotal = totals.reduce((sum, day) => sum + day.words, 0)
  const allTime = sessions
    .filter((session) => scopeId === null || session.projectId === scopeId)
    .reduce((sum, session) => sum + session.wordsWritten, 0)
  const progress = target > 0 ? Math.min(today / target, 1) : 0

  const breakdown = projects
    .map((project) => ({
      project,
      logged: sessions
        .filter((session) => session.projectId === project.id)
        .reduce((sum, session) => sum + session.wordsWritten, 0),
      manuscript: wordCounts[project.id] ?? 0,
    }))
    .filter((row) => row.logged > 0 || row.manuscript > 0)
    .sort((a, b) => b.manuscript - a.manuscript)

  async function handleSaveTarget() {
    const parsed = Number.parseInt(draft, 10)
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast({ title: 'Enter a daily word target of 0 or more', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await setDailyTarget(scopeId, parsed)
      toast({
        title: parsed === 0 ? 'Daily target cleared' : `Daily target set to ${parsed.toLocaleString()} words`,
      })
    } catch {
      toast({ title: 'Could not save your target', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const scopeLabel =
    scopeId === null
      ? 'across every project'
      : `in “${projects.find((p) => p.id === scopeId)?.title ?? 'this project'}”`

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Stats"
        description="Word-count goals, streaks, and session history."
        actions={
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="w-56" aria-label="Which projects to count">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {status === 'idle' || status === 'loading' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-72 rounded-xl" />
          </div>
        ) : status === 'error' ? (
          <EmptyState
            icon={BarChart3}
            title="Couldn't load your writing history"
            description="Something went wrong reading sessions from local storage."
            action={
              <Button variant="outline" onClick={() => loadAll()}>
                Try again
              </Button>
            }
          />
        ) : (
          <div className="mx-auto max-w-5xl space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon={PenLine}
                label="Today"
                value={today.toLocaleString()}
                hint={target > 0 ? `of a ${target.toLocaleString()} word target` : 'no target set'}
              />
              <StatCard
                icon={Flame}
                label="Streak"
                value={`${streak}`}
                hint={streak === 1 ? 'day meeting your target' : 'days meeting your target'}
              />
              <StatCard
                icon={BarChart3}
                label="Last 30 days"
                value={monthTotal.toLocaleString()}
                hint={`words written ${scopeLabel}`}
              />
              <StatCard
                icon={Target}
                label="All time"
                value={allTime.toLocaleString()}
                hint="words logged since you started"
              />
            </div>

            <Card className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">Today’s progress</h2>
                <p className="text-sm tabular-nums text-muted-foreground">
                  {today.toLocaleString()}
                  {target > 0 && ` / ${target.toLocaleString()}`}
                </p>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-500',
                    progress >= 1 ? 'bg-emerald-500' : 'brand-gradient-surface',
                  )}
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {target === 0
                  ? 'Set a daily target below to start tracking streaks.'
                  : today >= target
                    ? 'Target met — anything else today is a bonus.'
                    : `${(target - today).toLocaleString()} words to go.`}
              </p>
            </Card>

            {scopeId !== null &&
              (() => {
                const scopedProject = projects.find((p) => p.id === scopeId)
                if (!scopedProject || scopedProject.targetWordCount <= 0) return null
                const written = wordCounts[scopeId] ?? 0
                const paceTotals = dailyTotals(sessions, 14, scopeId)
                const projection = projectFinish(
                  written,
                  scopedProject.targetWordCount,
                  paceTotals,
                  now,
                )
                const deadline = goalFor(scopeId)?.deadline ?? null
                const verdict =
                  deadline !== null
                    ? deadlineVerdict(projection.wordsRemaining, projection.pace, deadline, now)
                    : null
                const dateValue =
                  deadline !== null ? new Date(deadline).toISOString().slice(0, 10) : ''
                return (
                  <Card className="p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="text-sm font-semibold">Finishing</h2>
                      <p className="text-sm tabular-nums text-muted-foreground">
                        {written.toLocaleString()} / {scopedProject.targetWordCount.toLocaleString()} words
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {projection.wordsRemaining === 0 ? (
                        'The manuscript has reached its target. The rest is revision.'
                      ) : projection.projectedFinish === null ? (
                        'No writing in the last two weeks, so there is no honest pace to project from. One session fixes that.'
                      ) : (
                        <>
                          At your two-week pace ({Math.round(projection.pace).toLocaleString()} words a
                          day, quiet days included), you finish around{' '}
                          <span className="font-medium text-foreground">
                            {new Date(projection.projectedFinish).toLocaleDateString(undefined, {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </span>
                          .
                        </>
                      )}
                    </p>
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="book-deadline">Deadline (optional)</Label>
                        <Input
                          id="book-deadline"
                          type="date"
                          value={dateValue}
                          onChange={(e) => {
                            const v = e.target.value
                            void setDeadline(scopeId, v ? new Date(`${v}T12:00:00`).getTime() : null)
                          }}
                          className="w-44"
                        />
                      </div>
                      {verdict && projection.wordsRemaining > 0 && (
                        <p
                          className={cn(
                            'pb-2 text-sm',
                            verdict.onPace ? 'text-emerald-500' : 'text-amber-500',
                          )}
                        >
                          {verdict.daysLeft === 0
                            ? `Due today — ${projection.wordsRemaining.toLocaleString()} words to go.`
                            : `Needs ${verdict.requiredPace.toLocaleString()} words a day for ${verdict.daysLeft} days — ${
                                verdict.onPace ? 'you are on pace.' : `your pace is ${Math.round(projection.pace).toLocaleString()}.`
                              }`}
                        </p>
                      )}
                    </div>
                  </Card>
                )
              })()}

            <Card className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">Last 30 days</h2>
                <p className="text-xs text-muted-foreground">
                  Green bars are days you hit your target.
                </p>
              </div>
              <div className="mt-4">
                {sessions.length === 0 ? (
                  <EmptyState
                    icon={PenLine}
                    title="Nothing tracked yet"
                    description="Write in the manuscript editor and your daily word counts will start appearing here."
                    className="border-none bg-transparent py-10"
                  />
                ) : (
                  <DayChart totals={totals} target={target} />
                )}
              </div>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h2 className="text-sm font-semibold">Daily target</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Applies {scopeId === null ? 'to every project without its own target' : scopeLabel}.
                </p>
                <div className="mt-4 space-y-2">
                  <Label htmlFor="daily-target">Words per day</Label>
                  <div className="flex gap-2">
                    <Input
                      id="daily-target"
                      type="number"
                      min={0}
                      step={50}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      className="max-w-40"
                    />
                    <Button onClick={handleSaveTarget} disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="text-sm font-semibold">By project</h2>
                {breakdown.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">No projects with words yet.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-border/70">
                    {breakdown.map((row) => (
                      <li key={row.project.id} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="min-w-0 truncate text-sm">{row.project.title}</span>
                        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                          {row.manuscript.toLocaleString()} words
                          {row.logged > 0 && (
                            <span className="ml-2 text-xs">
                              (+{row.logged.toLocaleString()} tracked)
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="border-t border-border/70 pt-6">
              <ProseReportPanel projects={projects} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
