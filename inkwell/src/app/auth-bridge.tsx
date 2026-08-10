import { useEffect } from 'react'

import {
  GUEST_LIBRARY,
  readActiveLibrary,
  switchActiveLibrary,
} from '@/lib/db/active-library'
import { cloudEnabled } from '@/lib/firebase/cloud-flags'
import { syncEngine } from '@/lib/sync/sync-engine'
import { startSyncRefreshBridge } from '@/lib/sync/sync-refresh'
import { useAuthStore } from '@/stores/auth-store'
import { useSyncStore } from '@/stores/sync-store'

/**
 * Every account gets its own local library, so the database that is
 * already open must belong to whoever is signed in. When auth lands on a
 * different account than the open library, the only safe move is to
 * remember the new choice and reload — a reload provably empties every
 * in-memory cache at once, which is exactly the no-mixing guarantee.
 * Returns true when a reload has been ordered and nothing further should
 * run against the wrong library.
 */
function alignLibraryWith(uid: string | null): boolean {
  const wanted = uid ?? GUEST_LIBRARY
  if (readActiveLibrary(localStorage) === wanted) return false
  if (!switchActiveLibrary(localStorage, wanted)) return false
  window.location.reload()
  return true
}

/**
 * Subscribes to Firebase auth state once at app boot, keeps the active
 * library aligned with the signed-in account, and starts/stops cloud sync
 * to match. Renders nothing.
 */
export function AuthBridge() {
  // With no Firebase project configured in a production build there is
  // nothing to subscribe to, and initialising would only fire doomed
  // requests at an emulator address that belongs to the visitor's machine.
  useEffect(() => (cloudEnabled ? useAuthStore.getState().init() : undefined), [])
  useEffect(() => (cloudEnabled ? useSyncStore.getState().init() : undefined), [])
  useEffect(() => (cloudEnabled ? startSyncRefreshBridge() : undefined), [])

  // Signing in switches to that account's own library (reloading if the
  // open one belongs to someone else) and begins syncing it; signing out
  // switches back to the guest library the same way. Sync only ever starts
  // once the open library is the signed-in account's own.
  useEffect(() => {
    if (!cloudEnabled) return
    // Covers a restored session that resolved before this subscription was
    // set up; `start()` is a no-op when already running for that uid.
    const current = useAuthStore.getState().user
    if (current && !alignLibraryWith(current.uid)) void syncEngine.start(current.uid)

    return useAuthStore.subscribe((state, previous) => {
      if (state.user?.uid === previous.user?.uid) return
      if (state.user) {
        if (!alignLibraryWith(state.user.uid)) void syncEngine.start(state.user.uid)
      } else {
        syncEngine.stop()
        alignLibraryWith(null)
      }
    })
  }, [])

  return null
}
