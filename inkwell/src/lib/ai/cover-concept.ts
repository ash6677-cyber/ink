/**
 * AI cover concepts — image generation on the writer's own key.
 *
 * Same bring-your-own-key rule as every other AI feature: INKWELL never
 * has a key of its own, and a provider is only offered here if its API
 * family actually generates images (the OpenAI images endpoint and
 * anything OpenAI-compatible that serves the same route). The prompt asks
 * for art with no lettering on it — typography is Cover Studio's own job,
 * and baked-in fake title text ruins a concept.
 */

import type { AiProviderConfig } from '@/types'

export interface CoverBrief {
  title: string
  genre: string
  synopsis: string
  /** The writer's own art direction, free-form. */
  mood: string
}

/** The image prompt, assembled from what the book already knows. */
export function buildCoverImagePrompt(brief: CoverBrief): string {
  const parts: string[] = [
    'Front cover artwork for a novel. Portrait composition, full-bleed painterly art.',
  ]
  if (brief.genre.trim()) parts.push(`Genre: ${brief.genre.trim()}.`)
  if (brief.synopsis.trim()) parts.push(`The book, in brief: ${brief.synopsis.trim()}`)
  if (brief.mood.trim()) parts.push(`Art direction from the author: ${brief.mood.trim()}`)
  parts.push(
    'Strong single focal point, room near the top third for a title to be set later.',
    'Absolutely no text, no lettering, no typography, no words anywhere in the image.',
  )
  return parts.join(' ')
}

/** Providers whose API family can serve the images endpoint. */
export function isImageCapable(provider: Pick<AiProviderConfig, 'kind'>): boolean {
  return provider.kind === 'openai' || provider.kind === 'openai-compatible'
}

export interface ImageRequest {
  url: string
  headers: Record<string, string>
  body: string
}

/**
 * The HTTP request that asks for the pictures, or null for a provider
 * family that has no images endpoint to ask.
 */
export function imageRequestFor(
  provider: Pick<AiProviderConfig, 'kind' | 'apiKey' | 'baseUrl'>,
  model: string,
  prompt: string,
  count: number,
): ImageRequest | null {
  if (!isImageCapable(provider)) return null
  const base =
    provider.kind === 'openai'
      ? 'https://api.openai.com/v1'
      : (provider.baseUrl ?? '').replace(/\/+$/, '')
  if (!base) return null
  return {
    url: `${base}/images/generations`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-image-1',
      prompt,
      n: Math.max(1, Math.min(4, Math.trunc(count))),
      size: '1024x1536', // portrait, the shape of a book
    }),
  }
}

export interface ImageResult {
  b64?: string
  url?: string
}

/** The pictures out of the response, whichever shape they arrived in. */
export function parseImageResults(json: unknown): ImageResult[] {
  if (typeof json !== 'object' || json === null) return []
  const data = (json as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  const out: ImageResult[] = []
  for (const entry of data) {
    if (typeof entry !== 'object' || entry === null) continue
    const b64 = (entry as { b64_json?: unknown }).b64_json
    const url = (entry as { url?: unknown }).url
    if (typeof b64 === 'string' && b64.length > 0) out.push({ b64 })
    else if (typeof url === 'string' && url.length > 0) out.push({ url })
  }
  return out
}
