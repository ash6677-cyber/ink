import { CloudOff, LogOut, User as UserIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { AuthDialog } from '@/features/auth/components/auth-dialog'
import { SyncStatus } from '@/features/auth/components/sync-status'
import { cloudEnabled } from '@/lib/firebase/cloud-flags'
import { useAuthStore } from '@/stores/auth-store'

export function AccountSettings() {
  const user = useAuthStore((s) => s.user)
  const status = useAuthStore((s) => s.status)
  const error = useAuthStore((s) => s.error)
  const signOut = useAuthStore((s) => s.signOut)
  const updateAuthorName = useAuthStore((s) => s.updateAuthorName)
  const { toast } = useToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [authorName, setAuthorName] = useState(user?.authorName ?? '')
  const [savingName, setSavingName] = useState(false)

  // Syncs the editable field whenever the underlying account changes.
  // Adjusted during render (React's recommended pattern) rather than via an
  // effect, since an effect here would cause an extra cascading render.
  const [lastSyncedName, setLastSyncedName] = useState(user?.authorName ?? '')
  if ((user?.authorName ?? '') !== lastSyncedName) {
    setLastSyncedName(user?.authorName ?? '')
    setAuthorName(user?.authorName ?? '')
  }

  // A build with no Firebase project behind it has nowhere to sign in to.
  // Say so plainly instead of showing a button that can't work.
  if (!cloudEnabled) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <CloudOff className="mx-auto size-6 text-muted-foreground/50" />
        <p className="mt-2 text-sm font-medium">Cloud accounts aren't set up on this build</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything still works — your library lives on this device and never leaves it. To turn
          on accounts and cross-device sync, build with a Firebase project configured; see
          docs/CLOUD_AUTH_SETUP.md.
        </p>
      </div>
    )
  }

  if (status === 'loading') {
    return <p className="text-sm text-muted-foreground">Loading account…</p>
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <UserIcon className="mx-auto size-6 text-muted-foreground/50" />
          <p className="mt-2 text-sm font-medium">You're not signed in</p>
          <p className="mt-1 text-sm text-muted-foreground">
            INKWELL works fully offline without an account. Sign in only if you want your
            library synced across devices and an author name attached to your projects.
          </p>
          <Button className="mt-4" onClick={() => setDialogOpen(true)}>
            Sign in
          </Button>
          {/* A redirect sign-in that fails comes back to this page with the
              dialog long since closed, so the error has nowhere else to go.
              Without this the writer returns to a screen that simply says
              they aren't signed in, with no hint as to why. */}
          {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        </div>
        <AuthDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </div>
    )
  }

  async function handleSaveAuthorName() {
    setSavingName(true)
    try {
      await updateAuthorName(authorName)
      toast({ title: 'Author name updated' })
    } catch {
      toast({ title: 'Could not update author name', variant: 'destructive' })
    } finally {
      setSavingName(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-lg border border-border p-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {(user.authorName ?? user.email ?? '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.authorName || 'No author name set'}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => signOut()}>
          <LogOut className="size-3.5" /> Sign out
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="account-author-name">Author name</Label>
        <p className="text-xs text-muted-foreground">
          Used to prefill the Author field when you create a new project.
        </p>
        <div className="flex gap-2">
          <Input
            id="account-author-name"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="Your name or pen name"
          />
          <Button
            onClick={handleSaveAuthorName}
            disabled={savingName || authorName === (user.authorName ?? '')}
          >
            Save
          </Button>
        </div>
      </div>

      <SyncStatus />
    </div>
  )
}
