import { describe, expect, it } from 'vitest'

import type { MapPin } from '@/types'

import { clamp01, nextZoom, normalizedPoint, pinTitle, scenesByPin } from './maps'

const pin = (overrides: Partial<MapPin>): MapPin => ({
  id: 'pin-1',
  x: 0.5,
  y: 0.5,
  entryId: null,
  label: '',
  ...overrides,
})

describe('normalizedPoint', () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 }

  it('maps a click to 0..1 coordinates inside the rect', () => {
    expect(normalizedPoint(rect, 300, 150)).toEqual({ x: 0.5, y: 0.5 })
    expect(normalizedPoint(rect, 100, 50)).toEqual({ x: 0, y: 0 })
    expect(normalizedPoint(rect, 500, 250)).toEqual({ x: 1, y: 1 })
  })

  it('clamps clicks that land outside the image', () => {
    expect(normalizedPoint(rect, 90, 40)).toEqual({ x: 0, y: 0 })
    expect(normalizedPoint(rect, 900, 900)).toEqual({ x: 1, y: 1 })
  })

  it('is safe on a zero-sized rect', () => {
    expect(normalizedPoint({ left: 0, top: 0, width: 0, height: 0 }, 10, 10)).toEqual({ x: 0, y: 0 })
  })

  it('keeps the same ratio under any zoom, because the rect scales too', () => {
    const zoomed = { left: 100, top: 50, width: 800, height: 400 } // 2× the same image
    expect(normalizedPoint(zoomed, 500, 250)).toEqual({ x: 0.5, y: 0.5 })
  })
})

describe('scenesByPin', () => {
  it('counts the scenes set at each pin’s entry', () => {
    const pins = [pin({ id: 'a', entryId: 'ford' }), pin({ id: 'b', entryId: 'keep' })]
    const scenes = [
      { locationCodexId: 'ford' },
      { locationCodexId: 'ford' },
      { locationCodexId: 'elsewhere' },
      { locationCodexId: null },
    ]
    const counts = scenesByPin(pins, scenes)
    expect(counts.get('a')).toBe(2)
    expect(counts.get('b')).toBe(0)
  })

  it('gives a plain marker zero without looking anything up', () => {
    expect(scenesByPin([pin({ id: 'a', entryId: null })], [{ locationCodexId: 'x' }]).get('a')).toBe(0)
  })
})

describe('pinTitle', () => {
  it('prefers the label, falls back to the entry name, then a plain mark', () => {
    expect(pinTitle(pin({ label: 'The old mill' }), 'The Ford', 0)).toBe('The old mill')
    expect(pinTitle(pin({}), 'The Ford', 0)).toBe('The Ford')
    expect(pinTitle(pin({}), undefined, 0)).toBe('Unnamed pin')
  })

  it('carries the scene count when there is one', () => {
    expect(pinTitle(pin({}), 'The Ford', 3)).toBe('The Ford · 3 scenes here')
    expect(pinTitle(pin({}), 'The Ford', 1)).toBe('The Ford · 1 scene here')
  })
})

describe('nextZoom', () => {
  it('zooms in on wheel-up and out on wheel-down', () => {
    expect(nextZoom(1, -100)).toBeCloseTo(1.2)
    expect(nextZoom(1.2, 100)).toBeCloseTo(1)
  })

  it('never leaves the 1..5 range', () => {
    expect(nextZoom(5, -100)).toBe(5)
    expect(nextZoom(1, 100)).toBe(1)
  })
})

describe('clamp01', () => {
  it('clamps both ends', () => {
    expect(clamp01(-0.2)).toBe(0)
    expect(clamp01(1.4)).toBe(1)
    expect(clamp01(0.31)).toBe(0.31)
  })
})
