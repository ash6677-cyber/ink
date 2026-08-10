/**
 * One local library per account.
 *
 * The library used to be a single pot per device: whoever was signed in —
 * or nobody — read and wrote the same tables. On a shared computer that
 * meant one person's sign-in could sweep another person's local books into
 * their cloud account. Now the device keeps a separate library for every
 * account (and one for signed-out use), and the active one is chosen
 * before the database ever opens.
 *
 * The choice is remembered in localStorage rather than derived from
 * Firebase at boot, because auth restores asynchronously and the database
 * must open first — everything in the app hangs off it. The auth bridge
 * reconciles the remembered choice whenever auth state actually changes,
 * by persisting the new choice and reloading: a reload is the one switch
 * that provably empties every in-memory cache at once, which is the whole
 * point of not mixing.
 */

export const GUEST_LIBRARY = 'guest'

const STORAGE_KEY = 'inkwell-active-library'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Account keys are Firebase UIDs; anything else is treated as guest. */
export function sanitizeLibraryKey(raw: string | null | undefined): string {
  if (!raw) return GUEST_LIBRARY
  const trimmed = raw.trim()
  if (trimmed === GUEST_LIBRARY) return GUEST_LIBRARY
  return /^[A-Za-z0-9_-]{1,128}$/.test(trimmed) ? trimmed : GUEST_LIBRARY
}

/** The library this device should open, guest when nothing is remembered. */
export function readActiveLibrary(storage: StorageLike): string {
  try {
    return sanitizeLibraryKey(storage.getItem(STORAGE_KEY))
  } catch {
    return GUEST_LIBRARY
  }
}

/**
 * Remember a new active library. Returns true when this changed anything —
 * the caller reloads the app on true, and must not on false or sign-in
 * would loop forever.
 */
export function switchActiveLibrary(storage: StorageLike, key: string): boolean {
  const next = sanitizeLibraryKey(key)
  const current = readActiveLibrary(storage)
  if (next === current) return false
  try {
    storage.setItem(STORAGE_KEY, next)
  } catch {
    return false
  }
  return true
}

/** The IndexedDB database name for a library. The guest library keeps the
 * original name, so every existing local-only install continues untouched. */
export function libraryDbName(key: string): string {
  const clean = sanitizeLibraryKey(key)
  return clean === GUEST_LIBRARY ? 'inkwell' : `inkwell-u-${clean}`
}

/** The desktop file parameter for a library: null keeps the original
 * `library.json`, an account gets its own `library-u-<uid>.json`. */
export function libraryFileParam(key: string): string | null {
  const clean = sanitizeLibraryKey(key)
  return clean === GUEST_LIBRARY ? null : `u-${clean}`
}
