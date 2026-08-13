import { describe, expect, it } from 'vitest'

import type { StoryPromise } from '@/types'

import { buildLedger, suggestTitle } from './promises'

const scenes = [
  { id: 's1', title: 'The Locket' },
  { id: 's2', title: 'The Market' },
  { id: 's3', title: 'The Road' },
  { id: 's4', title: 'The Reveal' },
]

let counter = 0
const promise = (overrides: Partial<StoryPromise>): StoryPromise => ({
  id: `pr-${++counter}`,
  createdAt: counter,
  updatedAt: counter,
  projectId: 'p1',
  title: 'A promise',
  quote: '',
  note: '',
  setupSceneId: 's1',
  payoffSceneId: null,
  ...overrides,
})

describe('buildLedger', () => {
  it('reports an unpaid promise as open, spanning to the end of the book', () => {
    const ledger = buildLedger([promise({ setupSceneId: 's2' })], scenes)
    expect(ledger.entries).toHaveLength(1)
    expect(ledger.entries[0].status).toBe('open')
    expect(ledger.entries[0].setupTitle).toBe('The Market')
    expect(ledger.entries[0].span).toBe(2)
    expect(ledger.open).toBe(1)
    expect(ledger.paid).toBe(0)
  })

  it('reports a paid promise with its span in scenes', () => {
    const ledger = buildLedger(
      [promise({ setupSceneId: 's1', payoffSceneId: 's4' })],
      scenes,
    )
    expect(ledger.entries[0].status).toBe('paid')
    expect(ledger.entries[0].payoffTitle).toBe('The Reveal')
    expect(ledger.entries[0].span).toBe(3)
    expect(ledger.unpaid).toEqual([])
  })

  it('calls out a payoff that lands before its setup', () => {
    const ledger = buildLedger(
      [promise({ setupSceneId: 's3', payoffSceneId: 's1' })],
      scenes,
    )
    expect(ledger.entries[0].status).toBe('backwards')
    // Backwards is not paid — it stays on the unpaid screen.
    expect(ledger.unpaid).toHaveLength(1)
  })

  it('orders entries by where their setups sit in the book', () => {
    const ledger = buildLedger(
      [promise({ setupSceneId: 's3' }), promise({ setupSceneId: 's1' })],
      scenes,
    )
    expect(ledger.entries.map((e) => e.setupTitle)).toEqual(['The Locket', 'The Road'])
  })

  it('survives a deleted setup scene, gathered at the end', () => {
    const ledger = buildLedger(
      [promise({ setupSceneId: 'gone' }), promise({ setupSceneId: 's1' })],
      scenes,
    )
    expect(ledger.entries[1].setupIndex).toBeNull()
    expect(ledger.entries[1].setupTitle).toBe('A deleted scene')
    expect(ledger.entries[1].span).toBe(0)
  })

  it('reopens a promise whose payoff scene was deleted', () => {
    const ledger = buildLedger(
      [promise({ setupSceneId: 's1', payoffSceneId: 'gone' })],
      scenes,
    )
    expect(ledger.entries[0].status).toBe('open')
    expect(ledger.entries[0].payoffTitle).toBe('A deleted scene')
  })

  it('is safe on an empty book and an empty ledger', () => {
    expect(buildLedger([], [])).toEqual({ entries: [], open: 0, paid: 0, unpaid: [] })
    const ledger = buildLedger([promise({ setupSceneId: 's1' })], [])
    expect(ledger.entries[0].setupIndex).toBeNull()
  })
})

describe('suggestTitle', () => {
  it('takes the first words of the passage', () => {
    expect(suggestTitle('The locket her mother never explained, hidden in the drawer.')).toBe(
      'The locket her mother never explained…',
    )
  })

  it('keeps a short passage whole, without an ellipsis', () => {
    expect(suggestTitle('The loaded rifle.')).toBe('The loaded rifle')
  })

  it('collapses whitespace and trims trailing punctuation', () => {
    expect(suggestTitle('  a   scar,\n unexplained,  ')).toBe('a scar, unexplained')
  })

  it('is empty for an empty selection', () => {
    expect(suggestTitle('')).toBe('')
  })
})
