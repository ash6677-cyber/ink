import { describe, expect, it } from 'vitest'

import type { BookChapter } from '@/features/reader/lib/compile-book'
import {
  shouldShowWhatsNew,
  bookFromShared,
  chapterPayload,
  newShareId,
  type SharedChapterData,
} from '@/features/reader/lib/share-book'
import type { Scene } from '@/types'

function scene(title: string, text: string): Scene {
  return {
    id: `s-${title}`,
    createdAt: 1,
    updatedAt: 1,
    projectId: 'p1',
    chapterId: 'c1',
    title,
    order: 0,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
    plainText: text,
    wordCount: text.split(/\s+/).length,
    status: 'drafting',
    povCharacterId: null,
    locationCodexId: null,
    summary: '',
    beats: [],
    labels: [],
    linkedCodexIds: [],
  } as Scene
}

function chapter(title: string, scenes: Scene[]): BookChapter {
  return {
    id: `c-${title}`,
    title,
    kind: 'chapter',
    number: 1,
    scenes,
    wordCount: scenes.reduce((sum, s) => sum + s.wordCount, 0),
  }
}

describe('newShareId', () => {
  it('is 22 chars of lowercase base36 — the link is the access control', () => {
    for (let i = 0; i < 50; i++) {
      expect(newShareId()).toMatch(/^[a-z0-9]{22}$/)
    }
  })

  it('never repeats in practice', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newShareId()))
    expect(ids.size).toBe(200)
  })
})

describe('chapterPayload → bookFromShared roundtrip', () => {
  it('carries the prose across intact', () => {
    const original = chapter('The Harbour', [
      scene('Arrival', 'The tide kept its own ledger.'),
      scene('Departure', 'By June it had a page for her too.'),
    ])
    const [rebuilt] = bookFromShared([chapterPayload(original, 0)])

    expect(rebuilt.title).toBe('The Harbour')
    expect(rebuilt.kind).toBe('chapter')
    expect(rebuilt.scenes).toHaveLength(2)
    expect(rebuilt.scenes[0].plainText).toBe('The tide kept its own ledger.')
    expect(rebuilt.scenes[1].plainText).toBe('By June it had a page for her too.')
    expect(rebuilt.scenes[0].content).toEqual(original.scenes[0].content)
    expect(rebuilt.wordCount).toBe(original.wordCount)
  })

  it('sorts fetched chapters by order, however the wire delivered them', () => {
    const first = chapterPayload(chapter('One', [scene('a', 'First words.')]), 0)
    const second = chapterPayload(chapter('Two', [scene('b', 'Second words.')]), 1)
    const book = bookFromShared([second, first])
    expect(book.map((c) => c.title)).toEqual(['One', 'Two'])
  })

  it('survives the JSON string trip the chapter docs actually take', () => {
    const payload = chapterPayload(chapter('Wire', [scene('w', 'Across the wire.')]), 0)
    const offTheWire = JSON.parse(JSON.stringify(payload)) as SharedChapterData
    const [rebuilt] = bookFromShared([offTheWire])
    expect(rebuilt.scenes[0].plainText).toBe('Across the wire.')
  })
})

describe('shouldShowWhatsNew', () => {
  const meta = { note: 'Chapter 9 rewritten, new ending.', noteAt: 200 }

  it('shows a returning reader a note newer than their last visit', () => {
    expect(shouldShowWhatsNew(meta, 100)).toBe(true)
  })

  it('never greets a first-time visitor — they have no "last visit"', () => {
    expect(shouldShowWhatsNew(meta, null)).toBe(false)
  })

  it('stays quiet when the note is older than the last visit', () => {
    expect(shouldShowWhatsNew(meta, 200)).toBe(false)
    expect(shouldShowWhatsNew(meta, 300)).toBe(false)
  })

  it('stays quiet when there is no note at all', () => {
    expect(shouldShowWhatsNew({ note: '', noteAt: 0 }, 100)).toBe(false)
    expect(shouldShowWhatsNew({ note: '   ', noteAt: 999 }, 100)).toBe(false)
  })
})
