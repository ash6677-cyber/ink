import { useEffect } from 'react'

import { useToast } from '@/components/ui/use-toast'
import { autoBackupDue } from '@/lib/db/auto-backup'
import { db } from '@/lib/db/schema'
import { isTauriRuntime } from '@/lib/db/tauri-bridge'
import { exportLibraryBlob, libraryFilename } from '@/lib/db/web-library'
import { usePreferencesStore } from '@/stores/preferences-store'

/** A pause after load, so the ritual never competes with opening the app. */
const IDLE_DELAY_MS = 6000

/**
 * The weekly backup, run rather than asked for. Renders nothing; once a
 * week (when opted in and there's work worth keeping) it saves the whole
 * library — a downloaded `.inkwell` file in the browser, a silent snapshot
 * into the backups folder in the desktop app — and says so once, quietly.
 */
export function AutoBackupRitual() {
  const enabled = usePreferencesStore((s) => s.autoBackupEnabled)
  const lastAutoBackupAt = usePreferencesStore((s) => s.lastAutoBackupAt)
  const markAutoBackedUp = usePreferencesStore((s) => s.markAutoBackedUp)
  const { toast } = useToast()

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const scenes = await db.scenes.toArray()
          const words = scenes.reduce((sum, scene) => sum + (scene.wordCount ?? 0), 0)
          if (
            cancelled ||
            !autoBackupDue({ enabled, lastAutoBackupAt, now: Date.now(), words })
          ) {
            return
          }

          if (isTauriRuntime()) {
            const { createBackup } = await import('@/lib/db/tauri-bridge')
            await createBackup()
          } else {
            const blob = await exportLibraryBlob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = libraryFilename()
            a.click()
            setTimeout(() => URL.revokeObjectURL(url), 0)
          }
          if (cancelled) return
          markAutoBackedUp()
          toast({
            title: 'Weekly backup saved',
            description: isTauriRuntime()
              ? 'A snapshot went into your backups folder.'
              : 'Your whole library, as a file in your downloads.',
          })
        } catch {
          // A failed automatic backup must not nag; the manual nudge still
          // exists and the ritual will try again next visit.
        }
      })()
    }, IDLE_DELAY_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [enabled, lastAutoBackupAt, markAutoBackedUp, toast])

  return null
}
