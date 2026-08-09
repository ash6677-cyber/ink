import { describe, expect, it } from 'vitest'

import {
  ALMANAC_FILE_VERSION,
  base64ToBytes,
  bytesToBase64,
  parseAlmanacFile,
  planAlmanacImport,
  serializeAlmanac,
  type AlmanacFileEntry,
} from './almanac-file'
import type { CodexEntry } from '@/types'

const entry = (over: Partial<CodexEntry> = {}): CodexEntry =>
  ({
    id: 'e1',
    createdAt: 1,
    updatedAt: 1,
    projectId: 'p1',
    seriesId: null,
    type: 'character',
    name: 'Charlotte',
    aliases: ['Lottie'],
    summary: 'A salt trader.',
    body: { type: 'doc', content: [] },
    plainText: 'Charlotte in prose.',
    attributes: [{ id: 'a1', key: 'Age', value: '32' }],
    relationships: [{ id: 'r1', targetEntryId: 'e2', label: 'sister' }],
    imageId: null,
    tags: ['cast'],
    aiContext: 'when-relevant',
    aiContextTokenBudget: null,
    ...over,
  }) as CodexEntry

describe('round-tripping an almanac', () => {
  it('keeps entries, attributes and relationships whole', () => {
    const file = serializeAlmanac('The Salt Road', [entry()], [], 123)
    const parsed = parseAlmanacFile(JSON.stringify(file))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.file.entries).toHaveLength(1)
    expect(parsed.file.entries[0].attributes).toEqual([{ id: 'a1', key: 'Age', value: '32' }])
    expect(parsed.file.entries[0].relationships).toEqual([
      { id: 'r1', targetEntryId: 'e2', label: 'sister' },
    ])
    expect(parsed.file.projectTitle).toBe('The Salt Road')
  })

  it('strips ids, timestamps and the project — a file is not a database row', () => {
    const file = serializeAlmanac('T', [entry()], [])
    const keys = Object.keys(file.entries[0])
    expect(keys).not.toContain('id')
    expect(keys).not.toContain('projectId')
    expect(keys).not.toContain('createdAt')
    // The linking key is deliberate: relationships in the file point at it.
    expect(file.entries[0].refId).toBe('e1')
  })

  it('re-points relationships at the ids the destination assigned', async () => {
    const { remapRelationships } = await import('./almanac-file')
    const file = serializeAlmanac('T', [entry({ id: 'e1' }), entry({ id: 'e2', name: 'Tomas' })], [])
    const map = new Map([
      ['e1', 'fresh-1'],
      ['e2', 'fresh-2'],
    ])
    expect(remapRelationships(file.entries[0], map)).toEqual([
      { id: 'r1', targetEntryId: 'fresh-2', label: 'sister' },
    ])
  })

  it('drops a relationship whose target did not make it across', async () => {
    // A link to an id that means nothing in the destination looks like data
    // and answers like a bug.
    const { remapRelationships } = await import('./almanac-file')
    const file = serializeAlmanac('T', [entry()], [])
    expect(remapRelationships(file.entries[0], new Map([['e1', 'fresh-1']]))).toEqual([])
  })

  it('carries only the images entries actually point at', () => {
    const images = [
      { id: 'img-used', mimeType: 'image/png', base64: 'aaaa' },
      { id: 'img-orphan', mimeType: 'image/png', base64: 'bbbb' },
    ]
    const file = serializeAlmanac('T', [entry({ imageId: 'img-used' })], images)
    expect(file.images.map((i) => i.id)).toEqual(['img-used'])
  })
})

describe('reading a file that claims to be an almanac', () => {
  it('names the reason for every refusal', () => {
    expect(parseAlmanacFile('not json {')).toEqual({ ok: false, reason: 'This is not a JSON file.' })
    expect(parseAlmanacFile('{}').ok).toBe(false)
    const backup = parseAlmanacFile(JSON.stringify({ kind: 'inkwell-library' }))
    expect(backup.ok).toBe(false)
    if (!backup.ok) expect(backup.reason).toMatch(/library backup/)
  })

  it('refuses a file from the future rather than half-reading it', () => {
    const future = { kind: 'inkwell-almanac', version: ALMANAC_FILE_VERSION + 1, entries: [] }
    const parsed = parseAlmanacFile(JSON.stringify(future))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.reason).toMatch(/newer version/)
  })

  it('refuses an entry with no name', () => {
    const file = { kind: 'inkwell-almanac', version: 1, entries: [{ type: 'character', name: ' ' }] }
    expect(parseAlmanacFile(JSON.stringify(file)).ok).toBe(false)
  })
})

describe('deciding what an import does', () => {
  const incoming = (name: string, type = 'character'): AlmanacFileEntry =>
    ({ ...serializeAlmanac('T', [entry({ name, type: type as CodexEntry['type'] })], []).entries[0] })

  it('skips a name that already exists rather than duplicating or overwriting', () => {
    // The version already there may carry months of work; an import is the
    // wrong place to lose it silently.
    const plan = planAlmanacImport([incoming('Charlotte'), incoming('Tomas')], [
      { id: 'dest-1', name: 'charlotte', type: 'character' },
    ])
    expect(plan.create.map((e) => e.name)).toEqual(['Tomas'])
    expect(plan.skipped).toEqual(['Charlotte'])
  })

  it('still resolves a skipped name, so links to it can land on the local copy', () => {
    // A skipped Tomas is still Tomas. "Sister of Tomas" should point at the
    // Tomas already living in the destination, not die because he did not
    // need importing.
    const plan = planAlmanacImport([incoming('Tomas')], [
      { id: 'dest-tomas', name: 'Tomas', type: 'character' },
    ])
    expect(plan.matchedByRef.get('e1')).toBe('dest-tomas')
  })

  it('lets a character and a place share a name', () => {
    const plan = planAlmanacImport([incoming('Winter', 'location')], [
      { id: 'dest-2', name: 'Winter', type: 'character' },
    ])
    expect(plan.create).toHaveLength(1)
  })

  it('never imports the same entry twice from one file', () => {
    const plan = planAlmanacImport([incoming('Charlotte'), incoming('CHARLOTTE')], [])
    expect(plan.create).toHaveLength(1)
    expect(plan.skipped).toEqual(['CHARLOTTE'])
  })
})

describe('images as text', () => {
  it('round-trips bytes exactly, including ones no string wants to hold', () => {
    const bytes = new Uint8Array(70_000)
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })
})
