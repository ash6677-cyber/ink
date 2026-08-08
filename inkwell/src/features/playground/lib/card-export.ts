/**
 * The verbs: a card leaves as JSON or as a PNG that carries its own data,
 * and either file comes back in as a whole character.
 */

import { saveExport } from '@/features/export/lib/save-file'
import { imageAssetRepo } from '@/lib/db/repositories'
import type { CharacterCard } from '@/types'

import { CARD_PNG_KEYWORD, cardToFile, type CardFileData } from './card-file'
import { embedTextChunk } from './png-chunks'
import { renderCardFaceToCanvas } from './render-card-face'

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The portrait could not be decoded.'))
    image.src = url
  })
}

function safeFilename(name: string): string {
  return name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'character'
}

/** Everything the file format carries, gathered off the record + portrait. */
export async function buildCardFileData(card: CharacterCard): Promise<CardFileData> {
  let avatarDataUrl: string | undefined
  if (card.avatarImageId) {
    const asset = await imageAssetRepo.get(card.avatarImageId)
    if (asset?.blob) avatarDataUrl = await blobToDataUrl(asset.blob)
  }
  return {
    displayName: card.displayName,
    description: card.description,
    personality: card.personality,
    scenario: card.scenario,
    firstMessage: card.firstMessage,
    exampleDialogue: card.exampleDialogue.map(({ input, response }) => ({ input, response })),
    voiceNotes: card.voiceNotes,
    tags: card.tags,
    design: card.design,
    avatarDataUrl,
  }
}

export async function exportCardJson(card: CharacterCard): Promise<'saved' | 'cancelled'> {
  const data = await buildCardFileData(card)
  return saveExport({
    filename: `${safeFilename(card.displayName)}.inkwell-card.json`,
    mimeType: 'application/json',
    text: cardToFile(data),
  })
}

async function renderFacePngBytes(card: CharacterCard): Promise<Uint8Array> {
  let image: HTMLImageElement | null = null
  if (card.avatarImageId) {
    const asset = await imageAssetRepo.get(card.avatarImageId)
    if (asset?.blob) image = await loadImage(URL.createObjectURL(asset.blob))
  }
  const canvas = document.createElement('canvas')
  renderCardFaceToCanvas(canvas, {
    name: card.displayName,
    design: card.design,
    tags: card.tags,
    image,
    crop: card.cropSettings,
  })
  if (image) URL.revokeObjectURL(image.src)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('The card face could not be rendered.')
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * The face as a PNG with the whole card embedded in a tEXt chunk — openable
 * as a picture anywhere, importable as a character here. The JSON payload
 * rides base64-encoded, because tEXt is Latin-1 and names are not.
 */
export async function exportCardPng(card: CharacterCard): Promise<'saved' | 'cancelled'> {
  const [face, data] = await Promise.all([renderFacePngBytes(card), buildCardFileData(card)])
  const stamped = embedTextChunk(
    face,
    CARD_PNG_KEYWORD,
    btoa(unescape(encodeURIComponent(cardToFile(data)))),
  )
  return saveExport({
    filename: `${safeFilename(card.displayName)}.inkwell-card.png`,
    mimeType: 'image/png',
    bytes: stamped,
  })
}

/** Decodes what `exportCardPng` encodes; the import side's counterpart. */
export function decodeCardPayload(base64: string): string {
  return decodeURIComponent(escape(atob(base64)))
}
