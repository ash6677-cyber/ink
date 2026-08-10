import { describe, expect, it } from 'vitest'

import {
  GUEST_LIBRARY,
  libraryDbName,
  libraryFileParam,
  readActiveLibrary,
  sanitizeLibraryKey,
  switchActiveLibrary,
} from '@/lib/db/active-library'

const memoryStorage = () => {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  }
}

describe('sanitizeLibraryKey', () => {
  it('accepts firebase-shaped uids and guest', () => {
    expect(sanitizeLibraryKey('Nl2AkX9bqrRV3mZoTOP2fKD41Xy2')).toBe('Nl2AkX9bqrRV3mZoTOP2fKD41Xy2')
    expect(sanitizeLibraryKey('guest')).toBe(GUEST_LIBRARY)
  })

  it('treats junk as guest — never a path, never empty', () => {
    expect(sanitizeLibraryKey('')).toBe(GUEST_LIBRARY)
    expect(sanitizeLibraryKey(null)).toBe(GUEST_LIBRARY)
    expect(sanitizeLibraryKey('../etc/passwd')).toBe(GUEST_LIBRARY)
    expect(sanitizeLibraryKey('uid with spaces')).toBe(GUEST_LIBRARY)
    expect(sanitizeLibraryKey('x'.repeat(129))).toBe(GUEST_LIBRARY)
  })
})

describe('readActiveLibrary / switchActiveLibrary', () => {
  it('defaults to guest on a fresh device', () => {
    expect(readActiveLibrary(memoryStorage())).toBe(GUEST_LIBRARY)
  })

  it('round-trips a switch and reports whether anything changed', () => {
    const storage = memoryStorage()
    expect(switchActiveLibrary(storage, 'uid-1')).toBe(true)
    expect(readActiveLibrary(storage)).toBe('uid-1')
    // Same key again: no change, so no reload loop.
    expect(switchActiveLibrary(storage, 'uid-1')).toBe(false)
    expect(switchActiveLibrary(storage, GUEST_LIBRARY)).toBe(true)
    expect(readActiveLibrary(storage)).toBe(GUEST_LIBRARY)
  })

  it('never persists junk as an account', () => {
    const storage = memoryStorage()
    expect(switchActiveLibrary(storage, '../x')).toBe(false) // junk → guest → unchanged
    expect(readActiveLibrary(storage)).toBe(GUEST_LIBRARY)
  })

  it('survives a throwing storage', () => {
    const broken = {
      getItem: () => {
        throw new Error('private mode')
      },
      setItem: () => {
        throw new Error('private mode')
      },
    }
    expect(readActiveLibrary(broken)).toBe(GUEST_LIBRARY)
    expect(switchActiveLibrary(broken, 'uid-1')).toBe(false)
  })
})

describe('library names', () => {
  it('the guest library keeps the original names, so old installs open untouched', () => {
    expect(libraryDbName(GUEST_LIBRARY)).toBe('inkwell')
    expect(libraryFileParam(GUEST_LIBRARY)).toBeNull()
  })

  it('accounts get their own database and file', () => {
    expect(libraryDbName('uid-1')).toBe('inkwell-u-uid-1')
    expect(libraryFileParam('uid-1')).toBe('u-uid-1')
  })

  it('junk keys collapse to the guest names', () => {
    expect(libraryDbName('../x')).toBe('inkwell')
    expect(libraryFileParam('../x')).toBeNull()
  })
})
