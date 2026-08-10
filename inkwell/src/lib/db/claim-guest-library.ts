/**
 * Bringing the signed-out books into a signed-in account.
 *
 * Every account has its own library now, so the books a writer made before
 * they ever signed in live in the guest library — and a first sign-in
 * would otherwise greet them with an empty shelf and a fright. This offers
 * the guest books once, copies them in on request (which also sends them
 * up to the account's cloud, because the copy goes through the ordinary
 * table interface), and leaves the guest library exactly as it was.
 *
 * A copy, deliberately not a move: the person signing in is not always
 * the person whose guest books these are, and taking someone else's books
 * away would be this feature failing at its own purpose.
 */

import Dexie from 'dexie'

import { GUEST_LIBRARY, libraryDbName } from '@/lib/db/active-library'
import { migrateLibrary, type LibraryDocument } from '@/lib/db/library-schema'
import { InkwellDB } from '@/lib/db/schema'
import { isTauriRuntime } from '@/lib/db/tauri-bridge'
import {
  buildLibraryDocument,
  importLibraryDocument,
  type ReadableTables,
} from '@/lib/db/web-library'

/** What the guest library holds, without opening it for writing. */
export interface GuestLibraryPeek {
  projects: number
  words: number
}

/** Null when there is no guest library or nothing in it worth offering. */
export async function peekGuestLibrary(): Promise<GuestLibraryPeek | null> {
  if (isTauriRuntime()) {
    const { loadGuestLibraryRaw } = await import('@/lib/db/tauri-bridge')
    const raw = await loadGuestLibraryRaw()
    if (!raw) return null
    try {
      const doc = migrateLibrary(JSON.parse(raw))
      return summarize(doc)
    } catch {
      return null
    }
  }

  const name = libraryDbName(GUEST_LIBRARY)
  if (!(await Dexie.exists(name))) return null
  const guest = new InkwellDB(name)
  try {
    const projects = await guest.projects.toArray()
    if (projects.length === 0) return null
    const scenes = await guest.scenes.toArray()
    return {
      projects: projects.length,
      words: scenes.reduce((sum, scene) => sum + (scene.wordCount ?? 0), 0),
    }
  } finally {
    guest.close()
  }
}

function summarize(doc: LibraryDocument): GuestLibraryPeek | null {
  if (doc.projects.length === 0) return null
  return {
    projects: doc.projects.length,
    words: doc.scenes.reduce((sum, scene) => sum + (scene.wordCount ?? 0), 0),
  }
}

/**
 * Copies the guest library into the active (account) library. Only called
 * when the account library is empty, so the replace semantics of a restore
 * amount to a plain add — and every written row syncs to the account's
 * cloud like any ordinary edit.
 */
export async function claimGuestLibrary(): Promise<void> {
  if (isTauriRuntime()) {
    const { loadGuestLibraryRaw } = await import('@/lib/db/tauri-bridge')
    const raw = await loadGuestLibraryRaw()
    if (!raw) return
    await importLibraryDocument(raw)
    return
  }

  const guest = new InkwellDB(libraryDbName(GUEST_LIBRARY))
  try {
    const doc = await buildLibraryDocument(guest as unknown as ReadableTables)
    await importLibraryDocument(JSON.stringify(doc))
  } finally {
    guest.close()
  }
}

const DISMISS_PREFIX = 'inkwell-claim-dismissed-'

export function claimDismissed(uid: string): boolean {
  try {
    return localStorage.getItem(DISMISS_PREFIX + uid) === '1'
  } catch {
    return true
  }
}

export function dismissClaim(uid: string): void {
  try {
    localStorage.setItem(DISMISS_PREFIX + uid, '1')
  } catch {
    /* nothing to remember with */
  }
}
