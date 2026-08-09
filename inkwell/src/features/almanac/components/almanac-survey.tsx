import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'

import {
  buildMentionIndex,
  findAppearances,
  totalMentions,
} from '@/features/almanac/lib/mentions'
import { ENTRY_TYPE_LABEL } from '@/features/almanac/lib/entry-type'
import { db } from '@/lib/db/schema'
import { cn } from '@/lib/utils'
import type { CodexEntry } from '@/types'

interface AlmanacSurveyProps {
  projectId: string
  entries: CodexEntry[]
  /** Narrows the grid below; clicking a count here sets it. */
  activeType: string
  onSelectType: (type: string) => void
}

/**
 * What the world adds up to.
 *
 * A wiki holds entries. An almanac tells you something about them — how much
 * of each kind there is, which of them the book actually leans on, and which
 * were written down and then never used. That last one is the reason this
 * exists: a cast of thirty with nine who never appear in a scene is worth
 * knowing about, and no amount of scrolling a card grid will tell you.
 */
export function AlmanacSurvey({
  projectId,
  entries,
  activeType,
  onSelectType,
}: AlmanacSurveyProps) {
  // Read straight from storage rather than through the editor's loaded scene
  // list: the survey covers the whole book, not the chapter that happens to
  // be open.
  const scenes = useLiveQuery(
    async () =>
      (await db.scenes.toArray())
        .filter((scene) => scene.projectId === projectId)
        .map((scene) => ({
          id: scene.id,
          chapterId: scene.chapterId,
          title: scene.title,
          plainText: scene.plainText,
        })),
    [projectId],
  )

  if (entries.length === 0) return null

  const index = buildMentionIndex(
    entries.map((entry) => ({ id: entry.id, name: entry.name, aliases: entry.aliases })),
  )
  const appearances = scenes ? findAppearances(scenes, index) : new Map()

  const counts = new Map<string, number>()
  for (const entry of entries) counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1)

  const unwritten = scenes
    ? entries.filter((entry) => !appearances.has(entry.id))
    : []
  const busiest = scenes
    ? [...entries]
        .map((entry) => ({ entry, mentions: totalMentions(appearances.get(entry.id)) }))
        .filter((row) => row.mentions > 0)
        .sort((a, b) => b.mentions - a.mentions)
        .slice(0, 5)
    : []

  return (
    <section className="space-y-3 border-b border-border/70 pb-5">
      <div className="flex flex-wrap gap-1.5">
        <TypeChip
          label="Everything"
          count={entries.length}
          active={activeType === 'all'}
          onClick={() => onSelectType('all')}
        />
        {[...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => (
            <TypeChip
              key={type}
              label={ENTRY_TYPE_LABEL[type as keyof typeof ENTRY_TYPE_LABEL] ?? type}
              count={count}
              active={activeType === type}
              onClick={() => onSelectType(type)}
            />
          ))}
      </div>

      {scenes && scenes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <section
            aria-label="Most written about"
            className="rounded-lg border border-border bg-card p-3"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Most written about
            </h3>
            {busiest.length === 0 ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Nothing here is named in the manuscript yet.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {busiest.map(({ entry, mentions }) => (
                  <li key={entry.id} className="flex items-baseline justify-between gap-2 text-sm">
                    <Link
                      to={`/almanac/${entry.id}?project=${projectId}`}
                      className="truncate hover:underline"
                    >
                      {entry.name}
                    </Link>
                    <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                      {mentions}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            aria-label="Written down, never written about"
            className="rounded-lg border border-border bg-card p-3"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Written down, never written about
            </h3>
            {unwritten.length === 0 ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Everything here has made it into the book.
              </p>
            ) : (
              <>
                <ul className="mt-1.5 flex flex-wrap gap-1">
                  {unwritten.slice(0, 8).map((entry) => (
                    <li key={entry.id}>
                      <Link
                        to={`/almanac/${entry.id}?project=${projectId}`}
                        className="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs hover:border-warning max-sm:min-h-11 pointer-coarse:min-h-11"
                      >
                        {entry.name}
                      </Link>
                    </li>
                  ))}
                </ul>
                {unwritten.length > 8 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    …and {unwritten.length - 8} more.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </section>
  )
}

function TypeChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs transition-colors max-sm:min-h-11 pointer-coarse:min-h-11',
        active
          ? 'border-primary bg-primary/10 font-medium text-foreground'
          : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  )
}
