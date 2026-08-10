/** True when running inside the Tauri desktop shell rather than a plain browser tab. */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
  return tauriInvoke<T>(command, args)
}

import { libraryFileParam, readActiveLibrary } from './active-library'

/** The account-scoped file parameter for every storage command: null keeps
 * the original library.json (guest), an account gets its own file. */
function activeLibraryParam(): string | null {
  try {
    return libraryFileParam(readActiveLibrary(localStorage))
  } catch {
    return null
  }
}

export async function loadLibraryRaw(): Promise<string | null> {
  return invoke<string | null>('load_library', { library: activeLibraryParam() })
}

/** Reads the guest (signed-out) library regardless of who is signed in —
 * only the claim flow uses this, and only ever to read. */
export async function loadGuestLibraryRaw(): Promise<string | null> {
  return invoke<string | null>('load_library', { library: null })
}

export async function saveLibraryRaw(json: string): Promise<void> {
  return invoke<void>('save_library', { json, library: activeLibraryParam() })
}

export async function createBackup(): Promise<string | null> {
  return invoke<string | null>('create_backup', { library: activeLibraryParam() })
}

export interface BackupInfo {
  filename: string
  createdAt: number
  size: number
}

export async function listBackups(): Promise<BackupInfo[]> {
  return invoke<BackupInfo[]>('list_backups', { library: activeLibraryParam() })
}

export async function restoreBackupRaw(filename: string): Promise<string> {
  return invoke<string>('restore_backup', { filename, library: activeLibraryParam() })
}

export async function exportLibraryRaw(destPath: string, json: string): Promise<void> {
  return invoke<void>('export_library', { destPath, json })
}

export async function importLibraryRaw(srcPath: string): Promise<string> {
  return invoke<string>('import_library', { srcPath })
}

/** Writes base64-encoded bytes to an absolute path chosen by the user. */
export async function saveBinaryFile(destPath: string, base64: string): Promise<void> {
  return invoke<void>('save_binary_file', { destPath, base64 })
}

/** Tells the Rust side it's safe to actually exit, after the frontend has flushed its save. */
export async function quitAfterSave(): Promise<void> {
  return invoke<void>('quit_after_save')
}
