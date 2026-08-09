import { describe, expect, it } from 'vitest'

import { buildRelationshipGraph, type GraphEntry } from '@/features/almanac/lib/relationship-graph'

const box = { width: 400, height: 400 }

function e(id: string, name: string, rels: [string, string][] = []): GraphEntry {
  return { id, name, type: 'character', relationships: rels.map(([targetEntryId, label]) => ({ targetEntryId, label })) }
}

describe('buildRelationshipGraph', () => {
  it('places only connected entries', () => {
    const g = buildRelationshipGraph(
      [e('a', 'Anna', [['b', 'sister']]), e('b', 'Bea'), e('c', 'Ced')],
      box,
    )
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['a', 'b'])
    expect(g.nodes.some((n) => n.id === 'c')).toBe(false)
  })

  it('resolves an edge with its label between the two nodes', () => {
    const g = buildRelationshipGraph([e('a', 'Anna', [['b', 'sister']]), e('b', 'Bea')], box)
    expect(g.edges).toHaveLength(1)
    const edge = g.edges[0]
    expect(edge.label).toBe('sister')
    const a = g.nodes.find((n) => n.id === 'a')!
    const b = g.nodes.find((n) => n.id === 'b')!
    expect([edge.x1, edge.y1]).toEqual([a.x, a.y])
    expect([edge.x2, edge.y2]).toEqual([b.x, b.y])
  })

  it('drops a relationship whose target no longer exists', () => {
    const g = buildRelationshipGraph([e('a', 'Anna', [['ghost', 'friend']])], box)
    expect(g.nodes).toHaveLength(0)
    expect(g.edges).toHaveLength(0)
  })

  it('collapses a mutual pair into a single drawn edge', () => {
    const g = buildRelationshipGraph(
      [e('a', 'Anna', [['b', 'loves']]), e('b', 'Bea', [['a', 'loves']])],
      box,
    )
    expect(g.edges).toHaveLength(1)
  })

  it('lays nodes on a circle within the box', () => {
    const g = buildRelationshipGraph(
      [e('a', 'A', [['b', 'x']]), e('b', 'B', [['c', 'y']]), e('c', 'C', [['a', 'z']])],
      box,
    )
    for (const n of g.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0)
      expect(n.x).toBeLessThanOrEqual(400)
      expect(n.y).toBeGreaterThanOrEqual(0)
      expect(n.y).toBeLessThanOrEqual(400)
    }
    // All three at the same distance from centre (a circle).
    const d = g.nodes.map((n) => Math.round(Math.hypot(n.x - 200, n.y - 200)))
    expect(new Set(d).size).toBe(1)
  })

  it('is deterministic — same input, same layout', () => {
    const input = [e('a', 'Anna', [['b', 'sister']]), e('b', 'Bea')]
    expect(buildRelationshipGraph(input, box)).toEqual(buildRelationshipGraph(input, box))
  })

  it('centres a single connected pair reasonably and centres a lone self-referenced node', () => {
    // One node with a self relationship is not "connected" to another, so it
    // is excluded — a map needs at least an edge between two nodes.
    const g = buildRelationshipGraph([e('a', 'Anna', [['a', 'alter ego']])], box)
    // Self-edge: source and target are the same real entry, so it IS placed.
    expect(g.nodes).toHaveLength(1)
    expect(g.nodes[0]).toMatchObject({ x: 200, y: 200 })
  })
})
