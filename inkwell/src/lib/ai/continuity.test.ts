import { describe, expect, it } from 'vitest'

import {
  buildContinuityMessages,
  factSheet,
  parseContinuityFindings,
} from '@/lib/ai/continuity'
import type { CodexEntry } from '@/types'

function entry(over: Partial<CodexEntry>): CodexEntry {
  return {
    id: 'e1',
    createdAt: 1,
    updatedAt: 1,
    projectId: 'p1',
    seriesId: null,
    type: 'character',
    name: 'Marta',
    aliases: [],
    summary: '',
    body: null,
    plainText: '',
    attributes: [],
    relationships: [],
    imageId: null,
    tags: [],
    aiContext: 'auto',
    aiContextTokenBudget: null,
    ...over,
  } as CodexEntry
}

const marta = entry({
  id: 'marta1',
  name: 'Marta',
  summary: 'The lighthouse keeper.',
  attributes: [
    { id: 'a1', key: 'Eyes', value: 'grey' },
    { id: 'a2', key: 'Home', value: 'never left the island' },
  ],
})
const empty = entry({ id: 'empty1', name: 'Nobody', summary: '', attributes: [] })

describe('factSheet', () => {
  it('lists entries with their id, name, summary and attributes', () => {
    const sheet = factSheet([marta])
    expect(sheet).toContain('[marta1] Marta')
    expect(sheet).toContain('Eyes: grey')
    expect(sheet).toContain('never left the island')
  })
  it('skips entries with nothing concrete to check', () => {
    expect(factSheet([empty])).toBe('')
  })
})

describe('buildContinuityMessages', () => {
  it('includes both the facts and the scene', () => {
    const messages = buildContinuityMessages('Marta gazed out to sea.', [marta])
    expect(messages[1].content).toContain('Eyes: grey')
    expect(messages[1].content).toContain('Marta gazed out to sea.')
  })
})

describe('parseContinuityFindings', () => {
  it('keeps findings whose entryId matches a real entry', () => {
    const raw = JSON.stringify([
      { entryId: 'marta1', fact: 'Eyes: grey', sceneClaim: 'her green eyes', severity: 'contradiction', explanation: 'Eye colour changed.' },
    ])
    const out = parseContinuityFindings(raw, [marta])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ entryId: 'marta1', entryName: 'Marta', severity: 'contradiction' })
  })

  it('drops findings that point at no real entry', () => {
    const raw = JSON.stringify([
      { entryId: 'ghost', fact: 'x', sceneClaim: 'y', severity: 'contradiction', explanation: '' },
    ])
    expect(parseContinuityFindings(raw, [marta])).toEqual([])
  })

  it('strips brackets the model leaves on the id', () => {
    const raw = JSON.stringify([
      { entryId: '[marta1]', fact: 'Home: never left', sceneClaim: 'her years in the city', severity: 'tension', explanation: '' },
    ])
    const out = parseContinuityFindings(raw, [marta])
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe('tension')
  })

  it('defaults an unknown severity to contradiction and dedupes', () => {
    const raw = JSON.stringify([
      { entryId: 'marta1', fact: 'Eyes: grey', sceneClaim: 'green eyes', severity: 'nonsense', explanation: '' },
      { entryId: 'marta1', fact: 'Eyes: grey', sceneClaim: 'green eyes', severity: 'contradiction', explanation: 'dup' },
    ])
    const out = parseContinuityFindings(raw, [marta])
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe('contradiction')
  })

  it('tolerates fences and returns [] for junk or an empty array', () => {
    expect(parseContinuityFindings('```json\n[]\n```', [marta])).toEqual([])
    expect(parseContinuityFindings('no json', [marta])).toEqual([])
  })
})
