/**
 * Just enough PNG surgery to hide a character inside their own picture.
 *
 * The character-card ecosystem's interchange format is "a PNG with the
 * card's JSON in a tEXt chunk" — the image is the card, and any app that
 * knows the keyword can read the data back out. tEXt is part of the PNG
 * spec; every viewer ignores chunks it doesn't know, so the file stays an
 * ordinary image everywhere else.
 *
 * Hand-rolled rather than a dependency because the whole job is: find the
 * IEND chunk, insert one chunk before it, and compute a CRC32 — and because
 * the *reading* side takes untrusted files, where less code is less surface.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** CRC32 (the PNG polynomial), table-driven, as the spec describes it. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((expected, i) => bytes[i] === expected)
}

interface Chunk {
  type: string
  /** Offset of the 4-byte length field that starts the chunk. */
  start: number
  /** Offset one past the chunk's CRC — where the next chunk begins. */
  end: number
  data: Uint8Array
}

function* chunks(bytes: Uint8Array): Generator<Chunk> {
  let offset = PNG_SIGNATURE.length
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    )
    const end = offset + 12 + length
    if (end > bytes.length) return // truncated file; stop rather than read junk
    yield { type, start: offset, end, data: bytes.subarray(offset + 8, offset + 8 + length) }
    if (type === 'IEND') return
    offset = end
  }
}

/**
 * Returns a copy of the PNG with `text` stored in a tEXt chunk under
 * `keyword`, inserted just before IEND. An existing chunk with the same
 * keyword is dropped first, so re-exporting never accumulates stale copies.
 *
 * tEXt is Latin-1 by spec, so the payload should be ASCII-safe — callers
 * here pass base64, which is.
 */
export function embedTextChunk(bytes: Uint8Array, keyword: string, text: string): Uint8Array {
  if (!isPng(bytes)) throw new Error('Not a PNG file.')

  const payload = new Uint8Array(keyword.length + 1 + text.length)
  for (let i = 0; i < keyword.length; i++) payload[i] = keyword.charCodeAt(i) & 0xff
  payload[keyword.length] = 0
  for (let i = 0; i < text.length; i++) payload[keyword.length + 1 + i] = text.charCodeAt(i) & 0xff

  const typeAndData = new Uint8Array(4 + payload.length)
  typeAndData.set([0x74, 0x45, 0x58, 0x74]) // 'tEXt'
  typeAndData.set(payload, 4)

  const chunk = new Uint8Array(12 + payload.length)
  new DataView(chunk.buffer).setUint32(0, payload.length)
  chunk.set(typeAndData, 4)
  new DataView(chunk.buffer).setUint32(8 + payload.length, crc32(typeAndData))

  // Rebuild: everything except any previous chunk under this keyword, with
  // the new chunk slotted in before IEND.
  const parts: Uint8Array[] = [bytes.subarray(0, PNG_SIGNATURE.length)]
  for (const existing of chunks(bytes)) {
    if (existing.type === 'tEXt' && readKeyword(existing.data) === keyword) continue
    if (existing.type === 'IEND') parts.push(chunk)
    parts.push(bytes.subarray(existing.start, existing.end))
  }

  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

function readKeyword(data: Uint8Array): string {
  const zero = data.indexOf(0)
  if (zero <= 0) return ''
  return String.fromCharCode(...data.subarray(0, zero))
}

/** The text stored under `keyword`, or null when the PNG carries none. */
export function extractTextChunk(bytes: Uint8Array, keyword: string): string | null {
  if (!isPng(bytes)) return null
  for (const chunk of chunks(bytes)) {
    if (chunk.type !== 'tEXt') continue
    if (readKeyword(chunk.data) !== keyword) continue
    const zero = chunk.data.indexOf(0)
    return String.fromCharCode(...chunk.data.subarray(zero + 1))
  }
  return null
}
