import { MessagesSquare } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  cardsForScene,
  discussionChatTitle,
  REASON_LABEL,
} from '@/features/playground/lib/scene-interview'
import { playgroundPath } from '@/features/playground/lib/playground-nav'
import { useCardStore } from '@/stores/card-store'
import { useChatStore } from '@/stores/chat-store'
import type { Scene } from '@/types'

const SHOWN = 3

/**
 * "Talk it over" — one tap from a scene to a Playground conversation with
 * a character who was in it, the scene's prose pre-loaded as context.
 * Renders nothing when no card fits this scene; the drawer stays honest.
 */
export function DiscussSceneSection({ scene }: { scene: Scene }) {
  const cards = useCardStore((s) => s.cards)
  const loadCards = useCardStore((s) => s.loadProject)
  const createChat = useChatStore((s) => s.createChat)
  const navigate = useNavigate()

  useEffect(() => {
    if (scene.projectId) loadCards(scene.projectId)
  }, [scene.projectId, loadCards])

  const candidates = cardsForScene(cards, {
    id: scene.id,
    title: scene.title,
    plainText: scene.plainText,
    povCharacterId: scene.povCharacterId,
    linkedCodexIds: scene.linkedCodexIds,
  }).slice(0, SHOWN)

  if (candidates.length === 0) return null

  async function discuss(cardId: string) {
    const chat = await createChat(scene.projectId, cardId, {
      title: discussionChatTitle(scene.title),
      firstMessage: '',
      sceneId: scene.id,
      mode: 'interview',
    })
    navigate(playgroundPath('chats', scene.projectId, `/${chat.id}`))
  }

  return (
    <div data-discuss-scene>
      <h3 className="flex items-center gap-1.5 text-sm font-medium">
        <MessagesSquare className="size-3.5 text-muted-foreground" aria-hidden />
        Talk it over
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Open a Playground chat with this scene riding along as context.
      </p>
      <ul className="mt-2 space-y-1.5">
        {candidates.map(({ card, reason }) => (
          <li key={card.id}>
            <button
              type="button"
              onClick={() => void discuss(card.id)}
              className="flex w-full items-baseline justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span className="truncate">
                Discuss with <strong>{card.displayName}</strong>
              </span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                {REASON_LABEL[reason]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
