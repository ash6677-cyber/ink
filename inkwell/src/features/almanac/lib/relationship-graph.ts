/**
 * The relationship map.
 *
 * The Almanac already stores relationships — "Marta → mother of → Tom" — but
 * only ever as a list on one entry at a time. A cast is a web, and a web is
 * easier to read as a picture. This turns the entries and their relationships
 * into a graph laid out on a circle: deterministic (no physics to settle, no
 * frame to wait for), stable across renders, and pure enough to unit-test the
 * geometry and the edge-resolution without a DOM.
 */

export interface GraphEntry {
  id: string
  name: string
  type: string
  relationships: { targetEntryId: string; label: string }[]
}

export interface GraphNode {
  id: string
  name: string
  type: string
  x: number
  y: number
}

export interface GraphEdge {
  fromId: string
  toId: string
  label: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface RelationshipGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

interface LayoutOptions {
  width: number
  height: number
  /** Node radius, kept clear of the circle edge so labels aren't clipped. */
  padding?: number
}

/**
 * Lays connected entries on a circle and resolves each relationship into a
 * drawable edge. Only entries that take part in at least one relationship
 * (as source or target) are placed — a lone island node is noise on a map
 * of connections. A relationship whose target no longer exists is dropped.
 */
export function buildRelationshipGraph(
  entries: GraphEntry[],
  { width, height, padding = 80 }: LayoutOptions,
): RelationshipGraph {
  const byId = new Map(entries.map((e) => [e.id, e]))

  // Which entries are connected, either as a source with relationships or as
  // the target of someone else's.
  const connected = new Set<string>()
  for (const entry of entries) {
    for (const rel of entry.relationships) {
      if (!byId.has(rel.targetEntryId)) continue
      connected.add(entry.id)
      connected.add(rel.targetEntryId)
    }
  }

  // Stable order so the same cast always lays out the same way.
  const placed = entries
    .filter((e) => connected.has(e.id))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))

  const cx = width / 2
  const cy = height / 2
  const radius = Math.max(20, Math.min(width, height) / 2 - padding)

  const nodes: GraphNode[] = placed.map((entry, i) => {
    // Start at the top (−90°) and go clockwise; a single node sits centre.
    const angle = placed.length === 1 ? 0 : (i / placed.length) * Math.PI * 2 - Math.PI / 2
    return {
      id: entry.id,
      name: entry.name,
      type: entry.type,
      x: placed.length === 1 ? cx : Math.round((cx + radius * Math.cos(angle)) * 100) / 100,
      y: placed.length === 1 ? cy : Math.round((cy + radius * Math.sin(angle)) * 100) / 100,
    }
  })

  const pos = new Map(nodes.map((n) => [n.id, n]))
  const edges: GraphEdge[] = []
  const seen = new Set<string>()
  for (const entry of placed) {
    const from = pos.get(entry.id)!
    for (const rel of entry.relationships) {
      const to = pos.get(rel.targetEntryId)
      if (!to) continue
      // Collapse a mutual pair to one drawn edge, but keep the label from
      // the first one encountered.
      const key = [entry.id, rel.targetEntryId].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({
        fromId: entry.id,
        toId: rel.targetEntryId,
        label: rel.label,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
      })
    }
  }

  return { nodes, edges }
}
