import { BookOpenText, Clock3, NotebookPen, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Card } from '@/components/ui/card'
import {
  buildDigest,
  readSprintLog,
  type DailyDigest,
  type DigestScene,
} from '@/features/stats/lib/daily-digest'
import { sceneRepo } from '@/lib/db/repositories'
import type { SessionLog } from '@/types'

const SCENES_SHOWN = 4

/**
 * "Today I wrote" — the day gathered into a receipt: words, sittings, time
 * at the desk, the scenes that moved, the best sprint. Honest when the day
 * is young: a quiet card, not a guilt trip.
 */
export function TodayDigestCard({
  sessions,
  projectId,
}: {
  sessions: SessionLog[]
  projectId: string | null
}) {
  // Scenes live in the editor's world; the digest only needs their
  // timestamps and titles, loaded once per visit.
  const [scenes, setScenes] = useState<DigestScene[]>([])
  useEffect(() => {
    let cancelled = false
    sceneRepo.list().then((all) => {
      if (cancelled) return
      setScenes(
        all.map((s) => ({
          id: s.id,
          title: s.title,
          projectId: s.projectId,
          updatedAt: s.updatedAt,
        })),
      )
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Captured once per visit: the digest is a snapshot of the day, not a
  // ticking clock, and readSprintLog already tolerates broken storage.
  const [now] = useState(() => Date.now())
  const [sprints] = useState(() => {
    try {
      return readSprintLog(window.localStorage)
    } catch {
      return []
    }
  })
  const digest: DailyDigest = buildDigest({ sessions, scenes, sprints, now, projectId })

  const extraScenes = digest.scenesTouched.length - SCENES_SHOWN

  return (
    <Card className="p-5" data-today-digest>
      <div className="flex items-center gap-2 text-muted-foreground">
        <NotebookPen className="size-4" strokeWidth={1.75} />
        <h2 className="text-xs font-medium uppercase tracking-wide">Today I wrote</h2>
      </div>

      {digest.words === 0 && digest.scenesTouched.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nothing yet today. The page is patient.
        </p>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="font-serif text-2xl font-semibold tabular-nums tracking-tight">
              {digest.words.toLocaleString()} <span className="text-base font-normal">words</span>
            </p>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock3 className="size-3" aria-hidden />
              {digest.minutes} min across {digest.sittings}{' '}
              {digest.sittings === 1 ? 'sitting' : 'sittings'}
            </p>
            {digest.bestSprint && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Zap className="size-3 text-warning" aria-hidden />
                Best sprint: {digest.bestSprint.words.toLocaleString()} words in{' '}
                {digest.bestSprint.minutes} min
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            {digest.scenesTouched.length > 0 ? (
              <>
                <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <BookOpenText className="size-3" aria-hidden />
                  Scenes touched
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {digest.scenesTouched.slice(0, SCENES_SHOWN).map((scene) => (
                    <li key={scene.id}>
                      <Link
                        to={
                          projectId
                            ? `/editor?project=${projectId}&scene=${scene.id}`
                            : `/editor?scene=${scene.id}`
                        }
                        className="inline-block max-w-56 truncate rounded-full border border-border px-2.5 py-1 text-xs hover:bg-accent"
                      >
                        {scene.title || 'Untitled scene'}
                      </Link>
                    </li>
                  ))}
                  {extraScenes > 0 && (
                    <li className="px-1.5 py-1 text-xs text-muted-foreground">
                      +{extraScenes} more
                    </li>
                  )}
                </ul>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Words logged, but no scene edits today — planning counts too.
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
