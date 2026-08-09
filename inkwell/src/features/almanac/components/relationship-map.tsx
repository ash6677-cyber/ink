import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { Share2 } from 'lucide-react'
import { buildRelationshipGraph } from '@/features/almanac/lib/relationship-graph'
import type { CodexEntry } from '@/types'

const WIDTH = 900
const HEIGHT = 620

/**
 * The Almanac's relationships drawn as a web. Entries are nodes; a stored
 * relationship is a labelled line between them. Laid on a circle so it's
 * stable and legible without a physics simulation, and rendered as plain
 * inline SVG — no charting dependency, sharp at any zoom, themable by the
 * app's own colour tokens. Clicking a node opens that entry.
 */
export function RelationshipMap({
  entries,
  projectId,
}: {
  entries: CodexEntry[]
  projectId: string
}) {
  const navigate = useNavigate()
  const graph = useMemo(
    () =>
      buildRelationshipGraph(
        entries.map((e) => ({
          id: e.id,
          name: e.name,
          type: e.type,
          relationships: e.relationships.map((r) => ({ targetEntryId: r.targetEntryId, label: r.label })),
        })),
        { width: WIDTH, height: HEIGHT },
      ),
    [entries],
  )

  if (graph.nodes.length === 0) {
    return (
      <EmptyState
        icon={Share2}
        title="No relationships to map yet"
        description="Add a relationship to an Almanac entry — “mother of”, “rival”, “owes a debt to” — and the web appears here."
        className="border-none bg-transparent"
      />
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card/40">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mx-auto block h-auto w-full max-w-4xl"
        role="img"
        aria-label={`Relationship map of ${graph.nodes.length} entries`}
      >
        {/* Edges under nodes, each with its label at the midpoint. */}
        {graph.edges.map((edge) => {
          const mx = (edge.x1 + edge.x2) / 2
          const my = (edge.y1 + edge.y2) / 2
          return (
            <g key={`${edge.fromId}-${edge.toId}`}>
              <line
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                stroke="var(--border)"
                strokeWidth={1.5}
              />
              {edge.label && (
                <text
                  x={mx}
                  y={my}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-muted-foreground text-[11px]"
                  style={{ paintOrder: 'stroke', stroke: 'var(--background)', strokeWidth: 4 }}
                >
                  {edge.label}
                </text>
              )}
            </g>
          )
        })}

        {graph.nodes.map((node) => (
          <g
            key={node.id}
            transform={`translate(${node.x} ${node.y})`}
            className="cursor-pointer"
            onClick={() => navigate(`/almanac/${node.id}?project=${projectId}`)}
          >
            <circle r={7} fill="var(--primary)" />
            <text
              x={0}
              y={-14}
              textAnchor="middle"
              className="fill-foreground text-[13px] font-medium"
              style={{ paintOrder: 'stroke', stroke: 'var(--background)', strokeWidth: 4 }}
            >
              {node.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
