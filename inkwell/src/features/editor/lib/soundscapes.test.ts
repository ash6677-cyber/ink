import { describe, expect, it } from 'vitest'

import {
  brownSamples,
  crackleSamples,
  mulberry32,
  rms,
  SOUNDSCAPES,
  whiteSamples,
} from './soundscapes'

const N = 44100

describe('mulberry32', () => {
  it('is deterministic and uniform-ish in [0, 1)', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    const seqA = Array.from({ length: 5 }, () => a())
    const seqB = Array.from({ length: 5 }, () => b())
    expect(seqA).toEqual(seqB)
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true)
  })
})

describe('whiteSamples', () => {
  it('fills the range without leaving it', () => {
    const samples = whiteSamples(N, mulberry32(1))
    expect(Math.max(...samples)).toBeLessThanOrEqual(1)
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(-1)
    expect(rms(samples)).toBeGreaterThan(0.4) // white noise sits near 1/√3
  })
})

describe('brownSamples', () => {
  it('stays in range, has energy, and never blows up or NaNs', () => {
    const samples = brownSamples(N, mulberry32(2))
    expect(samples.every((v) => v >= -1 && v <= 1 && Number.isFinite(v))).toBe(true)
    expect(rms(samples)).toBeGreaterThan(0.01)
  })

  it('is darker than white noise: adjacent samples move less', () => {
    const white = whiteSamples(N, mulberry32(3))
    const brown = brownSamples(N, mulberry32(3))
    const step = (s: Float32Array) => {
      let sum = 0
      for (let i = 1; i < s.length; i++) sum += Math.abs(s[i] - s[i - 1])
      return sum / s.length
    }
    expect(step(brown)).toBeLessThan(step(white) / 5)
  })
})

describe('crackleSamples', () => {
  it('is mostly silence with occasional pops', () => {
    const samples = crackleSamples(N, mulberry32(4), 6, 44100)
    const loud = samples.filter((v) => Math.abs(v) > 0.05).length
    expect(loud).toBeGreaterThan(0)
    expect(loud / samples.length).toBeLessThan(0.2)
    expect(samples.every((v) => v >= -1 && v <= 1)).toBe(true)
  })

  it('pops more when asked to', () => {
    const calm = crackleSamples(N, mulberry32(5), 2, 44100)
    const lively = crackleSamples(N, mulberry32(5), 20, 44100)
    expect(rms(lively)).toBeGreaterThan(rms(calm))
  })
})

describe('SOUNDSCAPES', () => {
  it('offers exactly the four promised rooms', () => {
    expect(SOUNDSCAPES.map((s) => s.id)).toEqual(['rain', 'fire', 'brown', 'cafe'])
  })
})
