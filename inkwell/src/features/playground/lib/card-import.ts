/**
 * Reading a card back in, from either shape it travels as.
 *
 * One entry point for the picker: a `.json` card file or a card PNG both
 * resolve to the same validated `CardFileData`, or to null — and null means
 * "not a card", which the UI reports as information, not as an error.
 */

import type { CardInput } from '@/stores/card-store'
import { useCardStore } from '@/stores/card-store'
import { storeImageFile } from '@/lib/image-upload'
import type { CharacterCard } from '@/types'

import { CARD_PNG_KEYWORD, dialogueWithIds, readCardFile, type CardFileData } from './card-file'
import { decodeCardPayload } from './card-export'
import { extractTextChunk, isPng } from './png-chunks'

export async function readCardImport(file: File): Promise<CardFileData | null> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (isPng(bytes)) {
    const payload = extractTextChunk(bytes, CARD_PNG_KEYWORD)
    if (!payload) return null
    try {
      return readCardFile(decodeCardPayload(payload))
    } catch {
      return null
    }
  }
  try {
    return readCardFile(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',', 2)
  const mime = head.match(/data:([^;]+)/)?.[1] ?? 'image/png'
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/**
 * Creates the card in the open project, portrait included. Runs through the
 * card store so the grid it lands on is already looking at it.
 */
export async function createCardFromFile(data: CardFileData): Promise<CharacterCard> {
  const store = useCardStore.getState()
  const input: CardInput = { displayName: data.displayName, codexEntryId: null, tags: data.tags }
  const card = await store.createCard(input)

  let avatarImageId: string | null = null
  if (data.avatarDataUrl) {
    const blob = dataUrlToBlob(data.avatarDataUrl)
    const asset = await storeImageFile(
      new File([blob], `${data.displayName}.png`, { type: blob.type }),
    )
    avatarImageId = asset.id
  }

  await store.updateCard(card.id, {
    description: data.description,
    personality: data.personality,
    scenario: data.scenario,
    firstMessage: data.firstMessage,
    exampleDialogue: dialogueWithIds(data.exampleDialogue),
    voiceNotes: data.voiceNotes,
    design: data.design,
    avatarImageId,
  })
  return { ...card, avatarImageId }
}
