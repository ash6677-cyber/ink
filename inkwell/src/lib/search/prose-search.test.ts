import { describe, expect, it } from 'vitest'

import { searchProse } from './prose-search'

const scene = (id: string, title: string, plainText: string) => ({ id, title, plainText })

describe('searchProse', () => {
  it('finds a phrase regardless of case and reports the scene', () => {
    const scenes = [
      scene('a', 'Arrival', 'The inn was quiet.'),
      scene('b', 'The Crossing', 'They walked the Salt Road until the light failed.'),
    ]
    const matches = searchProse(scenes, 'salt road')
    expect(matches).toHaveLength(1)
    expect(matches[0].sceneId).toBe('b')
    expect(matches[0].sceneTitle).toBe('The Crossing')
  })

  it('shows the phrase inside its snippet, ellipsised where it was cut', () => {
    const long =
      'For years afterward nobody spoke of it. ' +
      'They walked the salt road until the light failed and the gulls went silent. ' +
      'Then the winter came and the ferry stopped running altogether.'
    const [match] = searchProse([scene('a', 'One', long)], 'salt road')
    expect(match.snippet).toContain('salt road')
    expect(match.snippet.startsWith('…')).toBe(true)
    expect(match.snippet.endsWith('…')).toBe(true)
    // Word boundaries: never opens or closes mid-word.
    expect(match.snippet).not.toMatch(/^…\S*[a-z]-/)
    const inner = match.snippet.replace(/^…|…$/g, '')
    expect(long.replace(/\s+/g, ' ')).toContain(inner)
  })

  it('skips the ellipsis at an edge the snippet did not cut', () => {
    const [match] = searchProse([scene('a', 'One', 'Salt road at dawn.')], 'salt')
    expect(match.snippet).toBe('Salt road at dawn.')
  })

  it('returns one match per scene, in manuscript order, capped by the limit', () => {
    const scenes = Array.from({ length: 10 }, (_, i) =>
      scene(`s${i}`, `Scene ${i}`, `the tide came in again and again ${i}`),
    )
    const matches = searchProse(scenes, 'tide came', 3)
    expect(matches.map((m) => m.sceneId)).toEqual(['s0', 's1', 's2'])
  })

  it('refuses queries too short to mean anything', () => {
    const scenes = [scene('a', 'One', 'aa everywhere aa')]
    expect(searchProse(scenes, 'aa')).toEqual([])
    expect(searchProse(scenes, '  a ')).toEqual([])
  })
})
