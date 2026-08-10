import { describe, expect, it } from 'vitest'

import {
  COVER_DATA_URL_MAX,
  coverAcceptable,
  coverTargetBox,
  parseShareCover,
} from '@/features/reader/lib/share-cover'

const jpeg = (payload: string) => `data:image/jpeg;base64,${payload}`

describe('coverTargetBox', () => {
  it('shrinks the long edge to the cap, keeping proportion', () => {
    expect(coverTargetBox(1800, 2700)).toEqual({ width: 600, height: 900 })
    expect(coverTargetBox(2700, 1800)).toEqual({ width: 900, height: 600 })
  })

  it('never upscales a small cover', () => {
    expect(coverTargetBox(300, 450)).toEqual({ width: 300, height: 450 })
  })

  it('never emits a zero dimension', () => {
    expect(coverTargetBox(0, 0)).toEqual({ width: 1, height: 1 })
    expect(coverTargetBox(10000, 1)).toEqual({ width: 900, height: 1 })
  })
})

describe('coverAcceptable / parseShareCover', () => {
  it('accepts a well-formed jpeg data URL under the cap', () => {
    const url = jpeg('aGVsbG8=')
    expect(coverAcceptable(url)).toBe(true)
    expect(parseShareCover(url)).toBe(url)
  })

  it('rejects an oversized encoding', () => {
    const url = jpeg('A'.repeat(COVER_DATA_URL_MAX))
    expect(coverAcceptable(url)).toBe(false)
    expect(parseShareCover(url)).toBeNull()
  })

  it('rejects anything that is not an image data URL — remote input never reaches an <img> raw', () => {
    expect(parseShareCover('https://evil.example/x.jpg')).toBeNull()
    expect(parseShareCover('data:text/html;base64,PGI+aGk8L2I+')).toBeNull()
    expect(parseShareCover('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBeNull()
    expect(parseShareCover("data:image/jpeg;base64,abc'onerror='x")).toBeNull()
    expect(parseShareCover(42)).toBeNull()
    expect(parseShareCover(null)).toBeNull()
  })
})
