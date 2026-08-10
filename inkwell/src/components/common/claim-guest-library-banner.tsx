import { BookCopy, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import {
  claimDismissed,
  claimGuestLibrary,
  dismissClaim,
  peekGuestLibrary,
  type GuestLibraryPeek,
} from '@/lib/db/claim-guest-library'
import { GUEST_LIBRARY, readActiveLibrary } from '@/lib/db/active-library'
import { formatWordCount } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'
import { useProjectStore } from '@/stores/project-store'

/**
 * The one-time offer after a first sign-in: the books written before
 * signing in live in the signed-out library now, and this brings them
 * into the account — a copy, so the signed-out shelf keeps its own.
 * Shows only when the account's library is empty, something exists to
 * bring, and the offer hasn't been declined before.
 */
export function ClaimGuestLibraryBanner() {
  const { toast } = useToast()
  const user = useAuthStore((s) => s.user)
  const projects = useProjectStore((s) => s.projects)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)

  const [peek, setPeek] = useState<GuestLibraryPeek | null>(null)
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(false)

  const uid = user?.uid ?? null
  const eligible =
    uid !== null &&
    !hidden &&
    projects.length === 0 &&
    readActiveLibrary(localStorage) === uid &&
    readActiveLibrary(localStorage) !== GUEST_LIBRARY &&
    !claimDismissed(uid)

  useEffect(() => {
    if (!eligible) return
    let cancelled = false
    peekGuestLibrary().then((found) => {
      if (!cancelled) setPeek(found)
    })
    return () => {
      cancelled = true
    }
  }, [eligible])

  if (!eligible || !peek) return null

  async function bringThemIn() {
    if (!uid) return
    setBusy(true)
    try {
      await claimGuestLibrary()
      dismissClaim(uid)
      await fetchProjects()
      toast({ title: 'Your books are in', description: 'They now live in this account and sync with it.' })
    } catch {
      toast({ title: 'Could not copy the books over', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-claim-banner
      className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4"
    >
      <BookCopy className="size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {peek.projects === 1 ? 'A book' : `${peek.projects} books`} from before you signed in
          {peek.words > 0 && ` — ${formatWordCount(peek.words)} words`}
        </p>
        <p className="text-xs text-muted-foreground">
          Bring {peek.projects === 1 ? 'it' : 'them'} into this account? The signed-out copy
          stays where it is.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            if (uid) dismissClaim(uid)
            setHidden(true)
          }}
        >
          Not now
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void bringThemIn()} className="gap-1.5">
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          Bring {peek.projects === 1 ? 'it' : 'them'} in
        </Button>
      </div>
    </div>
  )
}
