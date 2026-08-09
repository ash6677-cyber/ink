import { useLiveQuery } from 'dexie-react-hooks'

import { buildMentionIndex, countMentions } from '@/features/almanac/lib/mentions'
import { buildPresence } from '@/features/almanac/lib/presence'
import { cn } from '@/lib/utils'
import { db } from '@/lib/db/schema'
import type { CodexEntry } from '@/types'

/**
 * Presence across the book: one cell per chapter, lit where this entry is
 * named, plus the longest stretch it vanishes. The appearances list says
 * where a character is; this says where they aren't — the gap a writer
 * can't feel while nose-down in a single scene.
 */
export function PresenceStrip({ entry, projectId }: { entry: CodexEntry; projectId: string }) {
  const summary = useLiveQuery(async () => {
    const [scenes, chapters] = await Promise.all([db.scenes.toArray(), db.chapters.toArray()])
    const index = buildMentionIndex([{ id: entry.id, name: entry.name, aliases: entry.aliases }])
    const presenceScenes = scenes
      .filter((s) => s.projectId === projectId)
      .map((s) => ({
        chapterId: s.chapterId,
        count: countMentions(s.plainText, index).get(entry.id) ?? 0,
        wordCount: s.wordCount,
      }))
    const presenceChapters = chapters
      .filter((c) => c.projectId === projectId)
      .map((c) => ({ chapterId: c.id, title: c.title, order: c.order }))
    return buildPresence(presenceChapters, presenceScenes)
  }, [entry.id, entry.name, entry.aliases.join('|'), projectId])

  if (!summary || summary.chapters.length < 2) return null

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Presence across the book</h3>
        <span className="text-xs tabular-nums text-muted-foreground">
          {summary.chaptersPresent} of {summary.chapters.length} chapters
        </span>
      </div>

      <div className="flex gap-0.5" role="img" aria-label={`Present in ${summary.chaptersPresent} of ${summary.chapters.length} chapters`}>
        {summary.chapters.map((c) => (
          <div
            key={c.chapterId}
            title={`${c.title}: ${c.mentions} ${c.mentions === 1 ? 'mention' : 'mentions'}`}
            className={cn(
              'h-6 flex-1 rounded-sm',
              c.present ? 'bg-primary' : 'bg-muted',
            )}
            style={c.present ? { opacity: 0.4 + Math.min(0.6, c.mentions / 8) } : undefined}
          />
        ))}
      </div>

      {summary.longestAbsenceSpan && summary.longestAbsenceWords > 0 && (
        <p className="text-xs text-muted-foreground">
          Absent for {summary.longestAbsenceWords.toLocaleString()} words
          {' '}({summary.longestAbsenceSpan}).
        </p>
      )}
    </div>
  )
}
