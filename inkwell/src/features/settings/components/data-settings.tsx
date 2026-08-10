import {
  AlertTriangle,
  Download,
  FolderOpen,
  History,
  Loader2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { DesktopDownload } from '@/features/settings/components/desktop-download'
import { Switch } from '@/components/ui/switch'
import { nextAutoBackupAt } from '@/lib/db/auto-backup'
import { usePreferencesStore } from '@/stores/preferences-store'
import { LibraryCheck } from '@/features/settings/components/library-check'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { exportLibraryToFile, listLibraryBackups, restoreFromBackup } from '@/lib/db/tauri-db'
import { isTauriRuntime } from '@/lib/db/tauri-bridge'
import type { BackupInfo } from '@/lib/db/tauri-bridge'
import { TrashSettings } from '@/features/settings/components/trash-settings'
import { StorageHealth } from '@/features/settings/components/storage-health'
import { useImportStore } from '@/stores/import-store'

function formatBackupDate(millis: number): string {
  return new Date(millis).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DataSettings() {
  const { toast } = useToast()
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [exporting, setExporting] = useState(false)
  const autoBackupEnabled = usePreferencesStore((s) => s.autoBackupEnabled)
  const setAutoBackupEnabled = usePreferencesStore((s) => s.setAutoBackupEnabled)
  const lastAutoBackupAt = usePreferencesStore((s) => s.lastAutoBackupAt)
  // Read once per render pass; the blurb is a rough date, not a clock.
  const [settingsNow] = useState(() => Date.now())
  const nextRunAt = nextAutoBackupAt({
    enabled: autoBackupEnabled,
    lastAutoBackupAt,
    now: settingsNow,
  })
  const [pendingRestore, setPendingRestore] = useState<BackupInfo | null>(null)
  const [restoring, setRestoring] = useState(false)
  const setPendingImportPath = useImportStore((s) => s.setPendingPath)

  const desktop = isTauriRuntime()

  const refreshBackups = useCallback(async () => {
    setLoadingBackups(true)
    try {
      const list = await listLibraryBackups()
      setBackups(list)
    } catch {
      toast({ title: 'Could not read backups', variant: 'destructive' })
    } finally {
      setLoadingBackups(false)
    }
  }, [toast])

  useEffect(() => {
    if (!desktop) return
    // Fetching the backup list from disk on mount is a genuine external-system
    // read, not derived state — the canonical valid use of this pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshBackups()
  }, [desktop, refreshBackups])

  async function handleExport() {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({
      title: 'Export INKWELL library',
      defaultPath: `inkwell-library-${new Date().toISOString().slice(0, 10)}.inkwell`,
      filters: [{ name: 'INKWELL library', extensions: ['inkwell', 'json'] }],
    })
    if (!path) return
    setExporting(true)
    try {
      await exportLibraryToFile(path)
      toast({ title: 'Library exported', description: path })
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  async function handleChooseImport() {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const path = await open({
      title: 'Import INKWELL library',
      multiple: false,
      filters: [{ name: 'INKWELL library', extensions: ['inkwell', 'json'] }],
    })
    if (!path || Array.isArray(path)) return
    setPendingImportPath(path)
  }

  async function handleConfirmRestore() {
    if (!pendingRestore) return
    setRestoring(true)
    try {
      await restoreFromBackup(pendingRestore.filename)
      toast({ title: 'Backup restored', description: 'Reloading…' })
      window.location.reload()
    } catch {
      toast({ title: 'Restore failed', variant: 'destructive' })
      setRestoring(false)
      setPendingRestore(null)
    }
  }

  // The browser build keeps its library in IndexedDB rather than on disk, so
  // it gets its own panel: durability status plus whole-library export and
  // restore. It used to say only that this was a desktop feature, which left
  // browser users with no way to get their work out at all.
  // The bin matters on every build, so it sits alongside storage health on
  // the web rather than only in the desktop shell's data tools.
  if (!desktop) {
    return (
      <div className="space-y-8">
        {/* First, because it is the answer to the problem the panel below
            describes: a browser can clear its own storage, and the installed
            app cannot. */}
        <DesktopDownload />
        <StorageHealth />
        {/* Worth more here than on the desktop build, not less: a browser
            library has no folder of files to inspect, so this is the only
            way to ask whether it is all still there. */}
        <section>
        <h2 className="text-sm font-semibold">Weekly automatic backup</h2>
        <div className="mt-2 flex items-start justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            Once a week, save the whole library on its own —{' '}
            {isTauriRuntime()
              ? 'a snapshot into the backups folder below.'
              : 'a backup file straight into your downloads.'}{' '}
            {autoBackupEnabled && nextRunAt !== null && (
              <>Next one {nextRunAt <= settingsNow ? 'on your next visit' : `around ${new Date(nextRunAt).toLocaleDateString()}`}.</>
            )}
          </p>
          <Switch
            checked={autoBackupEnabled}
            onCheckedChange={setAutoBackupEnabled}
            aria-label="Weekly automatic backup"
          />
        </div>
      </section>

      <LibraryCheck />
        <TrashSettings />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <DesktopDownload />

      <section>
        <h2 className="text-sm font-semibold">Storage location</h2>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <FolderOpen className="size-3.5" />
          <code className="rounded bg-muted px-1.5 py-0.5">%APPDATA%\INKWELL\library.json</code>
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Export &amp; import</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Export your whole library — every project, chapter, character, and setting — to a
          single portable file, or import one to replace what's here now.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={handleExport} disabled={exporting} className="gap-1.5">
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            Export library…
          </Button>
          <Button size="sm" variant="outline" onClick={handleChooseImport} className="gap-1.5">
            <Upload className="size-3.5" />
            Import library…
          </Button>
        </div>
      </section>

      <LibraryCheck />

      <section>
        <h2 className="text-sm font-semibold">Weekly automatic backup</h2>
        <div className="mt-2 flex items-start justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            Once a week, save a snapshot into the backups folder below on its own.
            {autoBackupEnabled && nextRunAt !== null && (
              <> Next one {nextRunAt <= settingsNow ? 'on your next visit' : `around ${new Date(nextRunAt).toLocaleDateString()}`}.</>
            )}
          </p>
          <Switch
            checked={autoBackupEnabled}
            onCheckedChange={setAutoBackupEnabled}
            aria-label="Weekly automatic backup"
          />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Backups</h2>
          <Button size="sm" variant="ghost" onClick={refreshBackups} disabled={loadingBackups} className="h-7 text-xs">
            {loadingBackups ? <Loader2 className="size-3.5 animate-spin" /> : 'Refresh'}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          A backup is taken automatically before the first save each session, and before any
          import or restore. The most recent 20 are kept.
        </p>
        {backups.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No backups yet — one is created the first time you save.
          </p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {backups.map((backup) => (
              <div
                key={backup.filename}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2 text-xs">
                  <History className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{formatBackupDate(backup.createdAt)}</span>
                  <span className="shrink-0 text-muted-foreground">{formatSize(backup.size)}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 text-xs"
                  onClick={() => setPendingRestore(backup)}
                >
                  Restore
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={pendingRestore !== null} onOpenChange={(open) => !open && setPendingRestore(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" /> Restore this backup?
            </DialogTitle>
            <DialogDescription>
              {pendingRestore && (
                <>
                  This replaces your current library with the backup from{' '}
                  {formatBackupDate(pendingRestore.createdAt)}. Your current library is backed up
                  first, so this can be undone too.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRestore(null)} disabled={restoring}>
              Cancel
            </Button>
            <Button onClick={handleConfirmRestore} disabled={restoring} className="gap-1.5">
              {restoring && <Loader2 className="size-3.5 animate-spin" />}
              {restoring ? 'Restoring…' : 'Restore'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TrashSettings />
    </div>
  )
}
