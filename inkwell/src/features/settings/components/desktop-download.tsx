import { CheckCircle2, Download, ExternalLink as ExternalLinkIcon, MonitorDown } from 'lucide-react'

import { ExternalLink } from '@/components/common/external-link'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { isTauriRuntime } from '@/lib/db/tauri-bridge'

/** Where the installers are published. */
export const RELEASES_URL = 'https://github.com/ash6677-cyber/ink/releases/latest'

/**
 * Getting INKWELL off the web and onto the machine.
 *
 * The browser version is real and complete, but it keeps a book inside a
 * browser's storage, which is a place browsers are allowed to clear. The
 * desktop build writes to ordinary files on disk. That is a difference worth
 * one paragraph and a button, rather than something a writer finds out about
 * after losing something.
 *
 * Shown only in the browser: an installed copy telling you to install it is
 * noise, so the desktop build gets a line confirming where it stands instead.
 */
export function DesktopDownload() {
  if (isTauriRuntime()) {
    return (
      <section className="space-y-2 rounded-lg border border-border p-4">
        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          This app
        </Label>
        <p className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <span>
            You are running the installed Windows app. Your work is saved to real files on this
            computer, and updates arrive automatically.
          </span>
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Get the desktop app
      </Label>
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <MonitorDown className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>
          Everything here works in the browser, but a browser can clear its own storage. The
          desktop app — Windows, Mac, or Linux — saves your books as ordinary files on your
          computer and works with no internet at all. The Windows app also updates itself.
        </span>
      </p>
      <Button asChild size="sm" className="gap-1.5">
        <ExternalLink href={RELEASES_URL}>
          <Download className="size-4" /> Download for Windows
          <ExternalLinkIcon className="size-3.5 opacity-70" />
        </ExternalLink>
      </Button>
      <p className="text-xs text-muted-foreground">
        Windows will warn you about an unrecognised app the first time — the installer is not
        certificate-signed yet. Choose <strong>More info</strong>, then <strong>Run anyway</strong>.
        Your existing books do not move across on their own: use Back up everything below, then
        restore it inside the app.
      </p>
    </section>
  )
}
