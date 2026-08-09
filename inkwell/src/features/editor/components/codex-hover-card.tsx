import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'

import { ENTRY_TYPE_ICON, ENTRY_TYPE_LABEL } from '@/features/almanac/lib/entry-type'
import { imageAssetRepo } from '@/lib/db/repositories'
import { useObjectUrl } from '@/lib/hooks/use-object-url'
import type { CodexEntry } from '@/types'

interface CodexHoverCardProps {
  entry: CodexEntry
  rect: DOMRect
  projectId: string
  onMouseEnter: () => void
  onMouseLeave: () => void
}

export function CodexHoverCard({
  entry,
  rect,
  projectId,
  onMouseEnter,
  onMouseLeave,
}: CodexHoverCardProps) {
  const navigate = useNavigate()
  const image = useLiveQuery(
    () => (entry.imageId ? imageAssetRepo.get(entry.imageId) : Promise.resolve(undefined)),
    [entry.imageId],
  )
  const imageUrl = useObjectUrl(image?.blob)
  const Icon = ENTRY_TYPE_ICON[entry.type]

  return (
    <div
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-50 w-64 animate-fade-in rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
      style={{ left: rect.left, top: rect.bottom + 8 }}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="size-full object-cover" />
          ) : (
            <Icon className="size-5 text-muted-foreground/50" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{entry.name}</p>
          <p className="text-xs text-muted-foreground">{ENTRY_TYPE_LABEL[entry.type]}</p>
        </div>
      </div>
      {entry.summary && (
        <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{entry.summary}</p>
      )}
      <button
        type="button"
        onClick={() => navigate(`/almanac/${entry.id}?project=${projectId}`)}
        className="mt-2 text-xs font-medium text-primary hover:underline"
      >
        Open in Codex →
      </button>
    </div>
  )
}
