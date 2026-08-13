import { AlarmClock, Plus, Send, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { EmptyState } from '@/components/common/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  campaignSummary,
  daysOut,
  groupSubmissions,
  isOverdue,
  SUBMISSION_COLUMNS,
  SUBMISSION_LABEL,
} from '@/features/planning/lib/submissions'
import { submissionRepo } from '@/lib/db/repositories'
import { cn } from '@/lib/utils'
import type { Submission, SubmissionStatus } from '@/types'

/**
 * The querying trail as a board: every market this book has been sent to
 * (or is about to be), from shortlist to offer, with the quiet numbers a
 * sad spreadsheet never surfaces — days out, requests, and which
 * responses are overdue a nudge. Zero AI, entirely local.
 */
export function SubmissionsView({ projectId }: { projectId: string }) {
  const [subs, setSubs] = useState<Submission[] | null>(null)
  // Pinned once per mount so the whole board judges "overdue" at the same
  // instant — and so a test can seed around a known clock.
  const [now] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    void submissionRepo.list().then((all) => {
      if (!cancelled) setSubs(all.filter((s) => s.projectId === projectId))
    })
    return () => {
      cancelled = true
    }
  }, [projectId])

  const grouped = useMemo(() => groupSubmissions(subs ?? []), [subs])

  const [market, setMarket] = useState('')
  const [contact, setContact] = useState('')

  async function handleAdd() {
    if (!market.trim()) return
    const created = await submissionRepo.create({
      projectId,
      market: market.trim(),
      contact: contact.trim(),
      status: 'shortlist',
      sentAt: null,
      respondBy: null,
      notes: '',
    })
    setSubs((all) => [...(all ?? []), created])
    setMarket('')
    setContact('')
  }

  async function handleStatus(submission: Submission, status: SubmissionStatus) {
    // Leaving the shortlist stamps the send date once; it never re-stamps
    // on later moves, because the query only went out one time.
    const changes: Partial<Submission> = { status }
    if (submission.sentAt === null && status !== 'shortlist') changes.sentAt = Date.now()
    await submissionRepo.update(submission.id, changes)
    setSubs((all) => (all ?? []).map((s) => (s.id === submission.id ? { ...s, ...changes } : s)))
  }

  async function handleRespondBy(submission: Submission, value: string) {
    const respondBy = value ? new Date(`${value}T12:00:00`).getTime() : null
    await submissionRepo.update(submission.id, { respondBy })
    setSubs((all) => (all ?? []).map((s) => (s.id === submission.id ? { ...s, respondBy } : s)))
  }

  async function handleRemove(submission: Submission) {
    await submissionRepo.remove(submission.id)
    setSubs((all) => (all ?? []).filter((s) => s.id !== submission.id))
  }

  if (subs === null) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
  }

  const summary = campaignSummary(subs, now)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4 sm:p-6" data-submissions>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-44 flex-1 gap-1.5">
          <label htmlFor="sub-market" className="text-xs font-medium text-muted-foreground">
            Add a market
          </label>
          <Input
            id="sub-market"
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            placeholder="Agent, magazine, press"
          />
        </div>
        <div className="grid min-w-44 flex-1 gap-1.5">
          <label htmlFor="sub-contact" className="text-xs font-medium text-muted-foreground">
            Contact <span className="font-normal">(optional)</span>
          </label>
          <Input
            id="sub-contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Name, email, portal"
          />
        </div>
        <Button onClick={() => void handleAdd()} disabled={!market.trim()} className="gap-1.5">
          <Plus className="size-4" /> Add
        </Button>
        {summary && (
          <p className="ml-auto text-sm tabular-nums text-muted-foreground" data-campaign-summary>
            {summary}
          </p>
        )}
      </div>

      {subs.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No submissions yet"
          description="Add the agents and magazines this book is going to, move each card as replies come in, and the board keeps the honest score of the campaign."
          className="border-none bg-transparent"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-x-auto">
          <div className="flex h-full min-w-max gap-3 pb-2">
            {SUBMISSION_COLUMNS.map((status) => (
              <div key={status} className="flex w-60 shrink-0 flex-col rounded-lg border border-border bg-muted/20">
                <p className="border-b border-border px-3 py-2 text-xs font-semibold">
                  {SUBMISSION_LABEL[status]}
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    {grouped[status].length}
                  </span>
                </p>
                <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                  {grouped[status].map((submission) => {
                    const waiting = daysOut(submission, now)
                    const overdue = isOverdue(submission, now)
                    return (
                      <li key={submission.id} className="rounded-md border border-border bg-card p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 flex-1 text-sm font-medium">{submission.market}</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${submission.market}`}
                            onClick={() => void handleRemove(submission)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                        {submission.contact && (
                          <p className="truncate text-xs text-muted-foreground">{submission.contact}</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {waiting !== null && (
                            <span className="tabular-nums">{waiting}d out</span>
                          )}
                          {overdue && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-warning/40 bg-warning/10 text-[10px] text-warning"
                            >
                              <AlarmClock className="size-3" /> overdue
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 grid gap-1.5">
                          <Select
                            value={submission.status}
                            onValueChange={(v) => void handleStatus(submission, v as SubmissionStatus)}
                          >
                            <SelectTrigger className="h-7 text-xs" aria-label={`Status of ${submission.market}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SUBMISSION_COLUMNS.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {SUBMISSION_LABEL[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="date"
                            aria-label={`Respond-by date for ${submission.market}`}
                            className={cn('h-7 text-xs', overdue && 'border-warning/60')}
                            value={
                              submission.respondBy
                                ? new Date(submission.respondBy).toISOString().slice(0, 10)
                                : ''
                            }
                            onChange={(e) => void handleRespondBy(submission, e.target.value)}
                          />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
