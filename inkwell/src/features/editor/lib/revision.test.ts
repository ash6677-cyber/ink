import { describe, expect, it } from 'vitest'

import {
  baselineLabel,
  draftReport,
  isBaselineSnapshot,
  nextDraftName,
} from '@/features/editor/lib/revision'

const scene = (id: string, plainText: string, wordCount: number) => ({
  id,
  title: `Scene ${id}`,
  plainText,
  wordCount,
})

const baseline = (sceneId: string, plainText: string, wordCount: number) => ({
  sceneId,
  plainText,
  wordCount,
})

describe('baseline labels', () => {
  it('are recognisable and human-readable', () => {
    expect(baselineLabel('Draft 1')).toBe('Baseline — Draft 1')
    expect(isBaselineSnapshot({ label: 'Baseline — Draft 1' })).toBe(true)
    expect(isBaselineSnapshot({ label: 'Autosave' })).toBe(false)
  })

  it('never produces a nameless label', () => {
    expect(baselineLabel('   ')).toBe('Baseline — Draft')
  })
})

describe('draftReport', () => {
  it('judges by content, not by having been opened', () => {
    const report = draftReport(
      [scene('a', 'unchanged words', 2), scene('b', 'reworked entirely', 2)],
      [baseline('a', 'unchanged words', 2), baseline('b', 'original words', 2)],
    )
    expect(report.revised).toBe(1)
    expect(report.untouched).toBe(1)
    expect(report.scenes.find((s) => s.sceneId === 'a')?.status).toBe('untouched')
    expect(report.scenes.find((s) => s.sceneId === 'b')?.status).toBe('revised')
  })

  it('counts scenes born after the freeze as new', () => {
    const report = draftReport(
      [scene('a', 'x', 1), scene('c', 'brand new scene', 3)],
      [baseline('a', 'x', 1)],
    )
    expect(report.added).toBe(1)
    expect(report.scenes.find((s) => s.sceneId === 'c')?.status).toBe('new')
    expect(report.scenes.find((s) => s.sceneId === 'c')?.wordDelta).toBe(3)
  })

  it('counts baseline scenes that vanished as removed, and nets the words honestly', () => {
    const report = draftReport(
      [scene('a', 'longer than before now', 4)],
      [baseline('a', 'short', 1), baseline('gone', 'a whole scene cut', 4)],
    )
    expect(report.removed).toBe(1)
    expect(report.wordsAtFreeze).toBe(5)
    expect(report.wordsNow).toBe(4)
    expect(report.netWords).toBe(-1)
  })

  it('progress tracks pre-existing scenes only — adding scenes is not revising', () => {
    const report = draftReport(
      [scene('a', 'changed', 1), scene('b', 'same', 1), scene('new', 'x', 1)],
      [baseline('a', 'original', 1), baseline('b', 'same', 1)],
    )
    expect(report.progress).toBe(0.5)
  })

  it('is empty-safe', () => {
    const report = draftReport([], [])
    expect(report.progress).toBe(0)
    expect(report.netWords).toBe(0)
  })
})

describe('nextDraftName', () => {
  it('numbers from the passes that exist', () => {
    expect(nextDraftName(0)).toBe('Draft 1')
    expect(nextDraftName(2)).toBe('Draft 3')
  })
})
