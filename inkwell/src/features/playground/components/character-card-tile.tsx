import { useLiveQuery } from 'dexie-react-hooks'
import { MoreHorizontal, Trash2, FileJson, ImageDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CardFace } from '@/features/playground/components/card-face'
import { playgroundPath } from '@/features/playground/lib/playground-nav'
import { imageAssetRepo } from '@/lib/db/repositories'
import { useObjectUrl } from '@/lib/hooks/use-object-url'
import type { CharacterCard } from '@/types'

interface CharacterCardTileProps {
  card: CharacterCard
  projectId: string
  onDelete: () => void
  onExportJson: () => void
  onExportPng: () => void
}

/**
 * A card in the grid.
 *
 * Only the interactive shell — opening the card, the actions menu, the lift
 * on hover. Everything about how the card *looks* belongs to `CardFace`, so
 * this screen cannot drift from the detail page.
 */
export function CharacterCardTile({
  card,
  projectId,
  onDelete,
  onExportJson,
  onExportPng,
}: CharacterCardTileProps) {
  const navigate = useNavigate()
  const image = useLiveQuery(
    () => (card.avatarImageId ? imageAssetRepo.get(card.avatarImageId) : Promise.resolve(undefined)),
    [card.avatarImageId],
  )
  const imageUrl = useObjectUrl(image?.blob)
  const open = () => navigate(playgroundPath('cards', projectId, `/${card.id}`))

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      aria-label={card.displayName}
      className="group cursor-pointer rounded-xl transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:hover:translate-y-0"
    >
      <CardFace
        name={card.displayName}
        design={card.design}
        imageUrl={imageUrl ?? null}
        crop={card.cropSettings}
        tags={card.tags}
        corner={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                aria-label={`More actions for ${card.displayName}`}
                className="flex size-7 items-center justify-center rounded-md bg-black/40 text-white opacity-0 backdrop-blur-sm transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 hover:bg-black/60"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={onExportJson}>
                <FileJson /> Export card file
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportPng}>
                <ImageDown /> Export as PNG card
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
    </div>
  )
}
