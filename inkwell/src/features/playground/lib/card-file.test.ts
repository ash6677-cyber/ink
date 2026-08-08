import { describe, expect, it } from 'vitest'

import { cardToFile, readCardFile, CARD_PNG_KEYWORD } from './card-file'
import { embedTextChunk, extractTextChunk, isPng } from './png-chunks'

/** A real 1×1 transparent PNG, bytes courtesy of the spec's smallest case. */
const TINY_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

const sample = {
  displayName: 'Maren Voss',
  description: 'Keeper of the ferry ledger.',
  personality: 'Wry, unhurried.',
  scenario: 'The inn on the night the ferry did not come.',
  firstMessage: 'You are late, which means you walked.',
  exampleDialogue: [{ input: 'Where is Old Tam?', response: 'Where the tide left him.' }],
  voiceNotes: 'Never raises her voice.',
  tags: ['keeper', 'ledger'],
  design: {
    frame: 'arch' as const,
    finish: 'foil' as const,
    accent: 'oklch(70% 0.12 250)',
    gloss: 0.7,
    vignette: 0.4,
  },
}

describe('card files', () => {
  it('round-trips every field', () => {
    const parsed = readCardFile(cardToFile(sample))
    expect(parsed).toEqual(sample)
  })

  it('refuses files that are not card files, without throwing', () => {
    expect(readCardFile('not json at all')).toBeNull()
    expect(readCardFile('{"kind":"inkwell-theme","name":"x"}')).toBeNull()
    expect(readCardFile('42')).toBeNull()
  })

  it('sanitises hostile field values instead of trusting them', () => {
    const parsed = readCardFile(
      JSON.stringify({
        kind: 'inkwell-character-card',
        displayName: 12,
        tags: ['ok', 7, '', '  padded  '],
        exampleDialogue: [{ input: 'a' }, 'junk', { response: 'b' }, {}],
        design: { frame: 'nonsense', finish: 'holo', accent: 'url(javascript:x)', gloss: 9 },
        avatarDataUrl: 'https://evil.example/x.png',
      }),
    )
    expect(parsed?.displayName).toBe('Imported character')
    expect(parsed?.tags).toEqual(['ok', 'padded'])
    expect(parsed?.exampleDialogue).toEqual([
      { input: 'a', response: '' },
      { input: '', response: 'b' },
    ])
    expect(parsed?.design).toEqual({
      frame: 'plain',
      finish: 'holo',
      accent: null,
      gloss: 1,
      vignette: 0.55,
    })
    expect(parsed?.avatarDataUrl).toBeUndefined()
  })

  it('keeps a well-formed data-URL portrait and only that shape', () => {
    const good = 'data:image/png;base64,aWJi'
    expect(readCardFile(cardToFile({ ...sample, avatarDataUrl: good }))?.avatarDataUrl).toBe(good)
  })
})

describe('png chunks', () => {
  it('recognises a PNG and refuses everything else', () => {
    expect(isPng(TINY_PNG)).toBe(true)
    expect(isPng(new TextEncoder().encode('GIF89a...'))).toBe(false)
  })

  it('embeds and extracts a text chunk, leaving the image a valid PNG', () => {
    const payload = btoa(cardToFile(sample))
    const stamped = embedTextChunk(TINY_PNG, CARD_PNG_KEYWORD, payload)
    expect(isPng(stamped)).toBe(true)
    expect(extractTextChunk(stamped, CARD_PNG_KEYWORD)).toBe(payload)
    // …and the whole card survives the trip through the picture.
    expect(readCardFile(atob(extractTextChunk(stamped, CARD_PNG_KEYWORD) ?? ''))).toEqual(sample)
  })

  it('re-embedding replaces the previous chunk rather than stacking', () => {
    const once = embedTextChunk(TINY_PNG, CARD_PNG_KEYWORD, btoa('first'))
    const twice = embedTextChunk(once, CARD_PNG_KEYWORD, btoa('second'))
    expect(extractTextChunk(twice, CARD_PNG_KEYWORD)).toBe(btoa('second'))
    // Exactly one keyword chunk: stripping it leaves none.
    const stripped = embedTextChunk(twice, CARD_PNG_KEYWORD, btoa('third'))
    expect(stripped.length).toBe(twice.length)
  })

  it('returns null for a PNG with no card in it', () => {
    expect(extractTextChunk(TINY_PNG, CARD_PNG_KEYWORD)).toBeNull()
  })
})
