import { describe, expect, it } from 'vitest'

import { countLabels, mergeLabels } from './labels'

describe('mergeLabels', () => {
  it('renames in place, keeping order', () => {
    expect(mergeLabels(['ferry', 'storm'], 'ferry', 'crossing')).toEqual(['crossing', 'storm'])
  })

  it('merging onto a label the scene already has leaves one copy, not two', () => {
    expect(mergeLabels(['ferry', 'crossing', 'storm'], 'ferry', 'crossing')).toEqual([
      'crossing',
      'storm',
    ])
  })

  it('leaves scenes without the label untouched', () => {
    expect(mergeLabels(['storm'], 'ferry', 'crossing')).toEqual(['storm'])
  })
})

describe('countLabels', () => {
  it('counts across scenes and sorts alphabetically', () => {
    const scenes = [
      { labels: ['storm', 'ferry'] },
      { labels: ['ferry'] },
      { labels: [] },
    ]
    expect(countLabels(scenes)).toEqual([
      ['ferry', 2],
      ['storm', 1],
    ])
  })
})
