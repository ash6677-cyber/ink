import { Download, Loader2, ShieldAlert, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { isTauriRuntime } from '@/lib/db/tauri-bridge'
import { db } from '@/lib/db/schema'
import { exportLibraryBlob, libraryFilename } from '@/lib/db/web-library'
import { usePreferencesStore } from '@/stores/preferences-store'

/** Long enough not to nag, short enough to beat Safari's seven-day eviction. */
const REMIND_AFTER_DAYS = 5
const SNOOZE_DAYS = 3

/**
 * A quiet reminder to keep a copy of the manuscript outside the browser.
 *
 * Browser storage is not a safe home for the only copy of a novel: it can be
 * evicted under pressure, cleared by the person tidying their history, and on
 * iOS is deleted outright after a week away. Cloud sync solves this properly,
 * but it is optional and needs a Firebase project — so until it is on, an
 * occasional exported file is the difference between a setback and a loss.
 *
 * It only appears once there is something worth losing, and never in the
 * desktop app, which keeps its own backups on disk.
 */
export function BackupNudge() {
  const lastBackupAt = usePreferencesStore((s) => s.lastBackupAt)
  const snoozedUntil = usePreferencesStore((s) => s.backupSnoozedUntil)
  const markBackedUp = usePreferencesStore((s) => s.markBackedUp)
  const snooze = usePreferencesStore((s) => s.snoozeBackupReminder)
  const autoBackupEnabled = usePreferencesStore((s) => s.autoBackupEnabled)
  const setAutoBackupEnabled = usePreferencesStore((s) => s.setAutoBackupEnabled)
  const { toast } = useToast()

  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  // Whether to show this depends on the clock and on a storage read, neither
  // of which belongs in render — reading the time while rendering would also
  // let the banner appear and vanish between two renders of the same state.
  useEffect(() => {
    if (isTauriRuntime()) return
    let cancelled = false
    void (async () => {
      const now = Date.now()
      // The weekly ritual makes the reminder redundant; it stays quiet —
      // and hides itself if it was up when the ritual got switched on.
      const due =
        !autoBackupEnabled &&
        now > snoozedUntil &&
        (lastBackupAt === null || now - lastBackupAt > REMIND_AFTER_DAYS * 86_400_000)
      if (!due) {
        if (!cancelled) setVisible(false)
        return
      }
      try {
        // Words rather than projects: an empty project someone made while
        // looking around is not work worth interrupting them about.
        const scenes = await db.scenes.toArray()
        const words = scenes.reduce((sum, scene) => sum + (scene.wordCount ?? 0), 0)
        if (!cancelled) setVisible(words >= 250)
      } catch {
        // A storage read that fails is not worth a warning of its own.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [lastBackupAt, snoozedUntil, autoBackupEnabled])

  if (!visible) return null

  async function handleExport() {
    setBusy(true)
    try {
      const blob = await exportLibraryBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = libraryFilename()
      a.click()
      URL.revokeObjectURL(url)
      markBackedUp()
      toast({ title: 'Library backed up' })
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 sm:p-4">
      <div className="pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-xl border border-amber-500/40 bg-card/95 p-3.5 shadow-lg backdrop-blur">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {lastBackupAt ? "It's been a while since your last backup" : 'Your work only exists here'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Everything is stored in this browser. Save a copy you can keep — it opens again in
            INKWELL on any device.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleExport} disabled={busy} className="h-8 gap-1.5 max-sm:h-11 pointer-coarse:h-11">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              Back up now
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 max-sm:h-11 pointer-coarse:h-11"
              onClick={() => {
                setAutoBackupEnabled(true)
                setVisible(false)
                toast({
                  title: 'Weekly backups are on',
                  description: 'A backup file will save itself once a week from now on.',
                })
              }}
            >
              Do this weekly, automatically
            </Button>
            <Button size="sm" variant="ghost" className="h-8 max-sm:h-11 pointer-coarse:h-11" onClick={() => snooze(SNOOZE_DAYS)}>
              Later
            </Button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss backup reminder"
          onClick={() => snooze(SNOOZE_DAYS)}
          className="touch-target shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
