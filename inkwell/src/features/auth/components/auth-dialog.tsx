import { Loader2 } from 'lucide-react'
import { useState, type ComponentType, useEffect } from 'react'

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
import { useToast } from '@/components/ui/use-toast'
import {
  AppleIcon,
  FacebookIcon,
  GoogleIcon,
} from '@/features/auth/components/provider-icons'
import { isTauriRuntime } from '@/lib/db/tauri-bridge'
import {
  AUTH_PROVIDER_LABELS,
  enabledAuthProviders,
  type AuthProviderId,
} from '@/lib/firebase/auth-providers'
import { useAuthStore } from '@/stores/auth-store'

const PROVIDER_ICONS: Record<AuthProviderId, ComponentType<React.SVGProps<SVGSVGElement>>> = {
  google: GoogleIcon,
  apple: AppleIcon,
  facebook: FacebookIcon,
}

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [socialPending, setSocialPending] = useState<AuthProviderId | null>(null)

  // Social sign-in relies on an OAuth handshake returning to the page's
  // origin. The desktop shell runs on an internal `tauri://` origin that
  // Firebase can't authorize, so these buttons cannot succeed there — hidden
  // rather than shown-and-broken. See docs/CLOUD_AUTH_SETUP.md for the
  // deep-link flow that would fix it.
  const providers = isTauriRuntime() ? [] : enabledAuthProviders

  const preloadAuth = useAuthStore((s) => s.preloadAuth)
  // The dialog opening IS sign-in intent: start fetching the auth SDK now,
  // so the provider popup opens instantly on click instead of after a
  // download that popup blockers mistake for an unsolicited window.
  useEffect(() => {
    if (open) preloadAuth()
  }, [open, preloadAuth])

  const error = useAuthStore((s) => s.error)
  const clearError = useAuthStore((s) => s.clearError)
  const signInWithEmail = useAuthStore((s) => s.signInWithEmail)
  const signUpWithEmail = useAuthStore((s) => s.signUpWithEmail)
  const signInWith = useAuthStore((s) => s.signInWith)
  const { toast } = useToast()

  function reset() {
    setEmail('')
    setPassword('')
    setAuthorName('')
    clearError()
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        await signUpWithEmail(email, password, authorName)
        toast({ title: `Welcome, ${authorName || 'there'}` })
      } else {
        await signInWithEmail(email, password)
        toast({ title: 'Signed in' })
      }
      reset()
      onOpenChange(false)
    } catch {
      // Error already surfaced via the store's `error` field, shown below.
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSocial(provider: AuthProviderId) {
    setSocialPending(provider)
    clearError()
    try {
      // Only a real sign-in gets the congratulations. Closing the provider's
      // window used to land here too, and the dialog cheerfully announced
      // "Signed in" and shut itself while the writer was still signed out.
      const outcome = await signInWith(provider)
      if (outcome !== 'signed-in') return
      toast({ title: 'Signed in' })
      reset()
      onOpenChange(false)
    } catch {
      // Error already surfaced via the store's `error` field, shown below.
    } finally {
      setSocialPending(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === 'signup' ? 'Create an account' : 'Sign in'}</DialogTitle>
          <DialogDescription>
            {mode === 'signup'
              ? 'Optional — INKWELL works fully offline without one. An account sets your author name and syncs your library across devices.'
              : 'Sign in to sync your library across devices.'}
          </DialogDescription>
        </DialogHeader>

        {/* Rendered from the configured provider list rather than hardcoded,
            so a build whose Firebase project has only Google enabled shows
            only Google. See src/lib/firebase/auth-providers.ts. */}
        {providers.length > 0 && (
          <>
            <div className="flex flex-col gap-2">
              {providers.map((id) => {
                const Icon = PROVIDER_ICONS[id]
                return (
                  <Button
                    key={id}
                    variant="outline"
                    className="gap-2"
                    disabled={socialPending !== null}
                    onClick={() => handleSocial(id)}
                  >
                    {socialPending === id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Icon />
                    )}
                    {AUTH_PROVIDER_LABELS[id]}
                  </Button>
                )
              })}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              or
              <div className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <form className="flex flex-col gap-3" onSubmit={handleEmailSubmit}>
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <Label htmlFor="auth-author-name">Author name</Label>
              <Input
                id="auth-author-name"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Your name or pen name"
                autoComplete="name"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button type="submit" disabled={submitting} className="w-full gap-1.5">
              {submitting && <Loader2 className="size-3.5 animate-spin" />}
              {mode === 'signup' ? 'Create account' : 'Sign in'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signup' ? 'signin' : 'signup')
                clearError()
              }}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {mode === 'signup'
                ? 'Already have an account? Sign in'
                : "Don't have an account? Create one"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
