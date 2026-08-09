import { blobToBase64 } from '@/lib/base64'
import { exportLibraryRaw, isTauriRuntime, saveBinaryFile } from '@/lib/db/tauri-bridge'
import type { ExportResult } from '@/features/export/lib/export-formats'

/**
 * Writes an export to disk.
 *
 * The desktop shell can't use a browser download — a Tauri webview has no
 * download manager and no Downloads folder of its own — so it opens the
 * real system save dialog and writes the bytes through Rust instead.
 * Binary payloads travel as base64 because the IPC bridge carries strings.
 */
export async function saveExport(result: ExportResult): Promise<'saved' | 'cancelled'> {
  if (isTauriRuntime()) return saveViaDesktopDialog(result)
  downloadInBrowser(result)
  return 'saved'
}

async function saveViaDesktopDialog(result: ExportResult): Promise<'saved' | 'cancelled'> {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const extension = result.filename.split('.').pop() ?? 'txt'
  const path = await save({
    title: 'Export manuscript',
    defaultPath: result.filename,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
  })
  if (!path) return 'cancelled'

  if (result.bytes) {
    const base64 = await blobToBase64(new Blob([result.bytes as BlobPart]))
    await saveBinaryFile(path, base64)
  } else {
    await exportLibraryRaw(path, result.text ?? '')
  }
  return 'saved'
}

function downloadInBrowser(result: ExportResult) {
  const payload: BlobPart = result.bytes
    ? (result.bytes as BlobPart)
    : (result.text ?? '')
  const blob = new Blob([payload], { type: result.mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = result.filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoking immediately can cancel the download in some browsers; one turn
  // of the event loop is enough for the click to have been consumed.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
