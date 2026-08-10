import { describe, expect, it } from 'vitest'

import {
  buildCoverImagePrompt,
  imageRequestFor,
  isImageCapable,
  parseImageResults,
} from '@/lib/ai/cover-concept'

const brief = {
  title: 'The Salt Road',
  genre: 'Coastal gothic',
  synopsis: 'A ferrywoman inherits a debt owed to the sea.',
  mood: 'Cold light, one small figure against a huge tide.',
}

describe('buildCoverImagePrompt', () => {
  it('carries the genre, synopsis, and art direction', () => {
    const prompt = buildCoverImagePrompt(brief)
    expect(prompt).toContain('Coastal gothic')
    expect(prompt).toContain('ferrywoman')
    expect(prompt).toContain('one small figure')
  })

  it('always forbids lettering — typography is Cover Studio’s job', () => {
    expect(buildCoverImagePrompt(brief)).toMatch(/no text, no lettering/i)
    expect(buildCoverImagePrompt({ title: '', genre: '', synopsis: '', mood: '' })).toMatch(
      /no text, no lettering/i,
    )
  })
})

describe('isImageCapable', () => {
  it('offers openai and openai-compatible; anthropic and openrouter have no images endpoint here', () => {
    expect(isImageCapable({ kind: 'openai' })).toBe(true)
    expect(isImageCapable({ kind: 'openai-compatible' })).toBe(true)
    expect(isImageCapable({ kind: 'anthropic' })).toBe(false)
    expect(isImageCapable({ kind: 'openrouter' })).toBe(false)
  })
})

describe('imageRequestFor', () => {
  it('targets the official endpoint for openai', () => {
    const req = imageRequestFor({ kind: 'openai', apiKey: 'sk-1', baseUrl: null }, 'gpt-image-1', 'a cover', 2)
    expect(req?.url).toBe('https://api.openai.com/v1/images/generations')
    expect(req?.headers.Authorization).toBe('Bearer sk-1')
    const body = JSON.parse(req?.body ?? '{}')
    expect(body).toMatchObject({ model: 'gpt-image-1', prompt: 'a cover', n: 2 })
  })

  it('uses the provider base URL for compatibles, slash-safe', () => {
    const req = imageRequestFor(
      { kind: 'openai-compatible', apiKey: 'k', baseUrl: 'http://localhost:9999/v1/' },
      'sdxl',
      'x',
      1,
    )
    expect(req?.url).toBe('http://localhost:9999/v1/images/generations')
  })

  it('clamps the count and refuses non-image families', () => {
    const req = imageRequestFor({ kind: 'openai', apiKey: 'k', baseUrl: null }, 'm', 'p', 99)
    expect(JSON.parse(req?.body ?? '{}').n).toBe(4)
    expect(imageRequestFor({ kind: 'anthropic', apiKey: 'k', baseUrl: null }, 'm', 'p', 1)).toBeNull()
    expect(
      imageRequestFor({ kind: 'openai-compatible', apiKey: 'k', baseUrl: null }, 'm', 'p', 1),
    ).toBeNull()
  })
})

describe('parseImageResults', () => {
  it('reads b64 and url entries', () => {
    expect(
      parseImageResults({ data: [{ b64_json: 'abc' }, { url: 'https://x/img.png' }] }),
    ).toEqual([{ b64: 'abc' }, { url: 'https://x/img.png' }])
  })

  it('is garbage-safe', () => {
    expect(parseImageResults(null)).toEqual([])
    expect(parseImageResults({})).toEqual([])
    expect(parseImageResults({ data: [{}, { b64_json: 42 }, 'x'] })).toEqual([])
  })
})
