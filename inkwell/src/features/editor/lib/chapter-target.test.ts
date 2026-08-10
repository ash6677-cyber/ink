import { describe, expect, it } from 'vitest'

import {
  chapterProgress,
  parseTargetInput,
  ringStroke,
} from '@/features/editor/lib/chapter-target'

describe('chapterProgress', () => {
  it('is null when no target is set', () => {
    expect(chapterProgress(500, null)).toBeNull()
    expect(chapterProgress(500, undefined)).toBeNull()
  })

  it('rejects unusable targets: zero, negative, non-finite', () => {
    expect(chapterProgress(500, 0)).toBeNull()
    expect(chapterProgress(500, -100)).toBeNull()
    expect(chapterProgress(500, Number.NaN)).toBeNull()
    expect(chapterProgress(500, Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('reports partial progress', () => {
    const p = chapterProgress(600, 2000)
    expect(p).toEqual({ fraction: 0.3, percent: 30, remaining: 1400, met: false })
  })

  it('clamps the ring at full but lets the percent run past 100', () => {
    const p = chapterProgress(2500, 2000)
    expect(p?.fraction).toBe(1)
    expect(p?.percent).toBe(125)
    expect(p?.remaining).toBe(0)
    expect(p?.met).toBe(true)
  })

  it('treats exactly-met as met with nothing remaining', () => {
    const p = chapterProgress(2000, 2000)
    expect(p?.met).toBe(true)
    expect(p?.remaining).toBe(0)
    expect(p?.fraction).toBe(1)
  })

  it('never reports negative progress for a negative word count', () => {
    const p = chapterProgress(-5, 1000)
    expect(p?.fraction).toBe(0)
    expect(p?.remaining).toBe(1000)
  })
})

describe('ringStroke', () => {
  it('paints the fraction of the circumference', () => {
    const { circumference, dash } = ringStroke(0.5, 10)
    expect(circumference).toBeCloseTo(2 * Math.PI * 10)
    expect(dash).toBeCloseTo(circumference / 2)
  })

  it('clamps out-of-range fractions', () => {
    expect(ringStroke(1.4, 10).dash).toBeCloseTo(ringStroke(1, 10).circumference)
    expect(ringStroke(-0.2, 10).dash).toBe(0)
  })
})

describe('parseTargetInput', () => {
  it('parses whole positive words', () => {
    expect(parseTargetInput('2000')).toBe(2000)
    expect(parseTargetInput(' 1500 ')).toBe(1500)
    expect(parseTargetInput('1999.9')).toBe(1999)
  })

  it('clears on blank and rejects junk and non-positive values', () => {
    expect(parseTargetInput('')).toBeNull()
    expect(parseTargetInput('   ')).toBeNull()
    expect(parseTargetInput('-')).toBeNull()
    expect(parseTargetInput('abc')).toBeNull()
    expect(parseTargetInput('0')).toBeNull()
    expect(parseTargetInput('-500')).toBeNull()
  })
})
