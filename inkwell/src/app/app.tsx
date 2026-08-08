import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'

import { AuthBridge } from '@/app/auth-bridge'
import { DesktopBootGate } from '@/app/desktop-boot-gate'
import { DesktopMenuBridge } from '@/app/desktop-menu-bridge'
import { GlobalShortcuts } from '@/app/global-shortcuts'
import { ThemeProvider } from '@/app/providers/theme-provider'
import { router } from '@/app/router'
import { StorageGate } from '@/app/storage-gate'
import { ThemeBridge } from '@/app/theme-bridge'
import { BackupNudge } from '@/components/common/backup-nudge'
import { ImportConfirmDialog } from '@/components/common/import-confirm-dialog'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useSyncEditorFont } from '@/lib/editor/use-sync-editor-font'
import { sweepSnapshots } from '@/lib/db/sweep-snapshots'
import { useTrashStore } from '@/stores/trash-store'

export function App() {
  useSyncEditorFont()

  // Sweeps anything that has sat in the bin past its retention window. Done
  // once at boot rather than on a timer: the bin only grows when someone
  // deletes something, and a writer who has not opened the app has not.
  useEffect(() => {
    void useTrashStore.getState().sweepExpired()
    // Scene history is thinned on the same schedule and for the same reason:
    // it only grows while someone is writing, so once a session is the right
    // cadence and a timer would be noise.
    void sweepSnapshots()
  }, [])

  return (
    <ThemeProvider>
      <ThemeBridge />
      <TooltipProvider delayDuration={200}>
        <DesktopBootGate>
          <StorageGate>
            <RouterProvider router={router} />
            <DesktopMenuBridge />
            <GlobalShortcuts />
            <ImportConfirmDialog />
            <BackupNudge />
            <AuthBridge />
          </StorageGate>
        </DesktopBootGate>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  )
}
