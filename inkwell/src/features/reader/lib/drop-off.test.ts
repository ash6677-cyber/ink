import { describe, expect, it } from 'vitest'

import { dropOffCurve, dropOffSummary, type PulsePing } from './drop-off'

const open = (at = 1): PulsePing => ({ at, chapter: null })
const reach = (chapter: number, at = 1): PulsePing => ({ at, chapter })

describe('dropOffCurve', () => {
  it('counts opens and reaches separately', () => {
    const curve = dropOffCurve([open(10), open(20), reach(0), reach(0), reach(1)], 3)
    expect(curve.opens).toBe(2)
    expect(curve.lastOpenedAt).toBe(20)
    expect(curve.reached).toEqual([2, 1, 0])
  })

  it('reads the classic drop-off: everyone opens, fewer finish', () => {
    // Three devices: A reads all 3 chapters, B stops after 2, C after 1.
    const pings = [
      open(), open(), open(),
      reach(0), reach(1), reach(2), // A
      reach(0), reach(1),           // B
      reach(0),                     // C
    ]
    const curve = dropOffCurve(pings, 3)
    expect(curve.reached).toEqual([3, 2, 1])
    expect(curve.finished).toBe(1)
    expect(curve.hasCurve).toBe(true)
  })

  it('is honest about a share with only opens (published before curves)', () => {
    const curve = dropOffCurve([open(5)], 4)
    expect(curve.hasCurve).toBe(false)
    expect(curve.finished).toBe(0)
    expect(curve.reached).toEqual([0, 0, 0, 0])
  })

  it('ignores pings for chapters the book no longer has', () => {
    const curve = dropOffCurve([reach(7)], 3)
    expect(curve.reached).toEqual([0, 0, 0])
  })

  it('is safe on an empty pulse and an empty book', () => {
    expect(dropOffCurve([], 0)).toEqual({
      opens: 0, lastOpenedAt: null, reached: [], finished: 0, hasCurve: false,
    })
  })
})

describe('dropOffSummary', () => {
  const title = (i: number) => `Chapter ${i + 1}`

  it('tells the whole story in one line', () => {
    const curve = dropOffCurve(
      [open(), open(), open(), reach(0), reach(0), reach(1), reach(0), reach(1), reach(2)],
      4,
    )
    // Nobody reached chapter 4, so nobody finished — the depth clause says
    // where the crowd got to instead.
    expect(dropOffSummary(curve, title)).toBe('3 opens · read as far as Chapter 3 · 0 finished')
  })

  it('drops the depth clause when readers reached the very end', () => {
    const curve = dropOffCurve([open(), reach(0), reach(1)], 2)
    expect(dropOffSummary(curve, title)).toBe('1 open · 1 finished')
  })

  it('reports opens alone for a curve-less share', () => {
    expect(dropOffSummary(dropOffCurve([open()], 3), title)).toBe('1 open')
  })
})
