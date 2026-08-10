import { DatabaseZap } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { isTauriRuntime } from '@/lib/db/tauri-bridge'

/**
 * The browser build keeps a writer's whole library in IndexedDB, and there
 * are real browsers where IndexedDB simply is not available: hardened
 * private-browsing modes, locked-down corporate profiles, some embedded
 * webviews. Without this gate that situation is a white page — the worst
 * possible answer to "where is my book?"
 *
 * The gate renders the app immediately and probes in the background; the
 * probe failing swaps in an explanation instead. Optimism costs nothing
 * here, because with no storage there is nothing on screen yet to lose.
 * The desktop build is exempt — its library lives in a file on disk.
 */

function probeIndexedDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    let idb: IDBFactory | undefined
    try {
      idb = window.indexedDB
    } catch {
      idb = undefined
    }
    if (!idb) {
      reject(new Error('IndexedDB is not available in this browser context.'))
      return
    }
    // Some browsers advertise indexedDB and then refuse to open anything —
    // Firefox's private windows did exactly this for years. Only an actual
    // open() answers the question.
    let request: IDBOpenDBRequest
    try {
      request = idb.open('inkwell-storage-probe')
    } catch (error) {
      reject(error instanceof Error ? error : new Error('IndexedDB refused to open.'))
      return
    }
    // A hung probe must never lock a healthy browser out of the app: after a
    // grace period, assume storage works and let Dexie find out for real.
    const optimism = setTimeout(resolve, 4000)
    request.onerror = () => {
      clearTimeout(optimism)
      reject(request.error ?? new Error('IndexedDB refused to open.'))
    }
    request.onsuccess = () => {
      clearTimeout(optimism)
      try {
        request.result.close()
        idb.deleteDatabase('inkwell-storage-probe')
      } catch {
        // Cleanup is a courtesy; the probe already has its answer.
      }
      resolve()
    }
  })
}

export function StorageGate({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    if (isTauriRuntime()) return
    probeIndexedDb().catch(() => setBlocked(true))
  }, [])

  if (!blocked) return <>{children}</>

  return (
    <div className="flex h-dvh items-center justify-center bg-background p-6">
      <div className="max-w-md">
        <DatabaseZap className="size-8 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold text-foreground">
          This browser is blocking INKWELL&rsquo;s storage
        </h1>
        <div className="mt-3 space-y-3 text-sm text-muted-foreground">
          <p>
            INKWELL keeps your books on your own device, in the browser&rsquo;s local database —
            and this browser window won&rsquo;t allow that. Private or incognito windows and some
            locked-down profiles do this deliberately.
          </p>
          <p>
            <span className="font-medium text-foreground">Nothing has been lost.</span> Any
            library you already have lives in your normal browser window (or in the Windows app)
            and is untouched — this window simply can&rsquo;t reach storage of its own.
          </p>
          <p>
            Open INKWELL in a regular, non-private window to write here. If you have a library
            backup file (Settings → Data → Export), it will import anywhere.
          </p>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Button onClick={() => window.location.reload()}>Try again</Button>
          <a
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            href="https://github.com/ash6677-cyber/ink/releases/latest"
            target="_blank"
            rel="noreferrer"
          >
            Get the desktop app
          </a>
        </div>
      </div>
    </div>
  )
}
