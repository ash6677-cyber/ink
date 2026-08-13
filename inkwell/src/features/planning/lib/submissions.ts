import type { Submission, SubmissionStatus } from '@/types'

/**
 * The querying trail as arithmetic: which column each market sits in,
 * which responses are overdue, and the one-line state of the campaign.
 * Zero AI, pure craft-life infrastructure. The board just draws it.
 */

export const SUBMISSION_COLUMNS: SubmissionStatus[] = [
  'shortlist', 'queried', 'partial', 'full', 'pass', 'offer',
]

export const SUBMISSION_LABEL: Record<SubmissionStatus, string> = {
  shortlist: 'Shortlist',
  queried: 'Queried',
  partial: 'Partial requested',
  full: 'Full requested',
  pass: 'Pass',
  offer: 'Offer',
}

/** Columns where a response is still expected — where "overdue" means something. */
const AWAITING: ReadonlySet<SubmissionStatus> = new Set(['queried', 'partial', 'full'])

export function isAwaiting(status: SubmissionStatus): boolean {
  return AWAITING.has(status)
}

/** Past its respond-by date while still waiting on them — time to nudge. */
export function isOverdue(submission: Submission, now: number): boolean {
  return (
    isAwaiting(submission.status) &&
    submission.respondBy !== null &&
    submission.respondBy < now
  )
}

/** Board grouping: every column present, each sorted oldest-sent first so
 * the longest-waiting market tops its column. Shortlist sorts by name. */
export function groupSubmissions(
  submissions: Submission[],
): Record<SubmissionStatus, Submission[]> {
  const grouped = Object.fromEntries(
    SUBMISSION_COLUMNS.map((status) => [status, [] as Submission[]]),
  ) as Record<SubmissionStatus, Submission[]>
  for (const submission of submissions) {
    ;(grouped[submission.status] ?? grouped.shortlist).push(submission)
  }
  for (const status of SUBMISSION_COLUMNS) {
    grouped[status].sort((a, b) =>
      status === 'shortlist'
        ? a.market.localeCompare(b.market)
        : (a.sentAt ?? Infinity) - (b.sentAt ?? Infinity),
    )
  }
  return grouped
}

/** The campaign in one line: "7 out · 2 requests · 1 overdue" — or where
 * it actually stands when an offer lands. */
export function campaignSummary(submissions: Submission[], now: number): string {
  const offers = submissions.filter((s) => s.status === 'offer').length
  if (offers > 0) return `${offers} ${offers === 1 ? 'offer' : 'offers'} on the table`
  const out = submissions.filter((s) => isAwaiting(s.status)).length
  if (out === 0) return submissions.length === 0 ? '' : 'Nothing out right now'
  const requests = submissions.filter((s) => s.status === 'partial' || s.status === 'full').length
  const overdue = submissions.filter((s) => isOverdue(s, now)).length
  const parts = [`${out} out`]
  if (requests > 0) parts.push(`${requests} ${requests === 1 ? 'request' : 'requests'}`)
  if (overdue > 0) parts.push(`${overdue} overdue`)
  return parts.join(' · ')
}

/** Days waiting since it was sent, for the card's quiet counter. */
export function daysOut(submission: Submission, now: number): number | null {
  if (submission.sentAt === null || !isAwaiting(submission.status)) return null
  return Math.max(0, Math.floor((now - submission.sentAt) / 86_400_000))
}
