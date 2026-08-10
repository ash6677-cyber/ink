/**
 * The cover, travelling with the share.
 *
 * A shared book used to open on a bare title page — the one thing the
 * writer's own reader never does once a cover exists. The art rides inside
 * the share document as a compressed JPEG data URL: no storage bucket, no
 * extra fetch, and it arrives in the same read as the title.
 *
 * Two gates, both here and both pure. Outbound: the encoded cover must fit
 * comfortably inside Firestore's 1 MiB document alongside the metadata, or
 * it is left off (a share without a cover beats a share that won't save).
 * Inbound: the share doc is remote input, so nothing goes into an <img>
 * unless it is a well-formed base64 image data URL under the same cap.
 */

/** Leaves ~300 KiB of headroom in the 1 MiB share document. */
export const COVER_DATA_URL_MAX = 700_000

/** The long edge the cover is shrunk to before encoding. Big enough to be
 * sharp on a phone spread, small enough to fit the budget with ease. */
export const COVER_MAX_EDGE = 900

/** Scale-to-fit inside the max edge, never upscaling. */
export function coverTargetBox(
  width: number,
  height: number,
  maxEdge = COVER_MAX_EDGE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 }
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

const DATA_URL_SHAPE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/

/** Outbound gate: is this encoding small and well-formed enough to ship? */
export function coverAcceptable(dataUrl: string): boolean {
  return dataUrl.length <= COVER_DATA_URL_MAX && DATA_URL_SHAPE.test(dataUrl)
}

/** Inbound gate: the only cover a reader page will ever render is a
 * well-formed image data URL under the cap — anything else is null. */
export function parseShareCover(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return coverAcceptable(value) ? value : null
}
