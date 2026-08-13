import { describe, expect, it } from 'vitest'

import { searchLibrary, type LibraryDoc } from './library-search'

const doc = (overrides: Partial<LibraryDoc>): LibraryDoc => ({
  id: 'd1',
  kind: 'almanac',
  title: 'Untitled',
  body: '',
  ...overrides,
})

describe('searchLibrary', () => {
  it('finds content, not just names', () => {
    const results = searchLibrary(
      [doc({ id: 'a', title: 'Marta', body: 'She keeps the ford and hates the salt road.' })],
      'salt road',
    )
    expect(results).toHaveLength(1)
    expect(results[0].snippet).toContain('salt road')
  })

  it('ranks a title hit above a body hit', () => {
    const results = searchLibrary(
      [
        doc({ id: 'body', title: 'The Keep', body: 'A locket lies buried here.' }),
        doc({ id: 'title', title: 'The Locket', body: 'An heirloom.' }),
      ],
      'locket',
    )
    expect(results.map((r) => r.doc.id)).toEqual(['title', 'body'])
  })

  it('requires every term somewhere — AND, not OR', () => {
    const docs = [
      doc({ id: 'both', title: 'Bram', body: 'The rifle above the mantel.' }),
      doc({ id: 'one', title: 'Ana', body: 'The rifle in the barn.' }),
    ]
    expect(searchLibrary(docs, 'rifle mantel').map((r) => r.doc.id)).toEqual(['both'])
  })

  it('prefers whole words over substrings', () => {
    const results = searchLibrary(
      [
        doc({ id: 'sub', title: 'x', body: 'The forded river.' }),
        doc({ id: 'word', title: 'y', body: 'The ford at dawn.' }),
      ],
      'ford',
    )
    expect(results[0].doc.id).toBe('word')
  })

  it('snips context around the first body hit, whole words only', () => {
    const long = `${'quiet '.repeat(40)}the unexplained scar on her wrist ${'quiet '.repeat(40)}`
    const [result] = searchLibrary([doc({ body: long })], 'scar')
    expect(result.snippet).toContain('unexplained scar on her wrist')
    expect(result.snippet.startsWith('…')).toBe(true)
    expect(result.snippet.endsWith('…')).toBe(true)
  })

  it('falls back to the title as snippet when only the title matched', () => {
    const [result] = searchLibrary([doc({ title: 'The Ford', body: 'Nothing else.' })], 'ford')
    expect(result.snippet).toBe('The Ford')
  })

  it('honors the limit, best first', () => {
    const docs = Array.from({ length: 20 }, (_, i) =>
      doc({ id: `d${i}`, title: i === 7 ? 'Ledger' : `Entry ${i}`, body: 'the ledger of storms' }),
    )
    const results = searchLibrary(docs, 'ledger', 5)
    expect(results).toHaveLength(5)
    expect(results[0].doc.id).toBe('d7')
  })

  it('ignores queries too short to mean anything', () => {
    expect(searchLibrary([doc({ body: 'ab everywhere' })], 'ab')).toEqual([])
    expect(searchLibrary([doc({ body: 'x' })], '   ')).toEqual([])
  })
})
