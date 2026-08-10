import { describe, expect, it } from 'vitest'

import { rtfToParagraphs } from '@/features/import/lib/rtf-text'

describe('rtfToParagraphs', () => {
  it('extracts paragraphs split by \\par', () => {
    const rtf = String.raw`{\rtf1\ansi Hello there.\par And a second paragraph.\par}`
    expect(rtfToParagraphs(rtf)).toEqual(['Hello there.', 'And a second paragraph.'])
  })

  it('skips the font and color tables whole', () => {
    const rtf = String.raw`{\rtf1{\fonttbl{\f0 Times New Roman;}{\f1 Helvetica;}}{\colortbl;\red0\green0\blue0;}Body text only.\par}`
    expect(rtfToParagraphs(rtf)).toEqual(['Body text only.'])
  })

  it('skips optional \\* destinations', () => {
    const rtf = String.raw`{\rtf1{\*\expandedcolortbl;;}Real words.\par}`
    expect(rtfToParagraphs(rtf)).toEqual(['Real words.'])
  })

  it('decodes hex escapes and typographic control words', () => {
    const rtf = String.raw`{\rtf1 caf\'e9 \emdash{} said \ldblquote so\rdblquote\par}`
    expect(rtfToParagraphs(rtf)).toEqual(['café — said “so”'])
  })

  it('decodes unicode escapes with their fallback convention', () => {
    // \uc1 means one fallback character follows each \uN; it must be eaten.
    const rtf = String.raw`{\rtf1\uc1 Look: \u1055?\u1088?\u1080? done\par}`
    expect(rtfToParagraphs(rtf)).toEqual(['Look: При done'])
  })

  it('ignores raw newlines, as the spec says — they are not spaces', () => {
    // Writers wrap RTF lines at syntax boundaries; a newline must vanish
    // entirely or "cafe\n," would grow a phantom space.
    const rtf = '{\\rtf1 One \npara\ngraph.\\par}'
    expect(rtfToParagraphs(rtf)).toEqual(['One paragraph.'])
  })

  it('handles escaped braces and backslashes as literals', () => {
    const rtf = String.raw`{\rtf1 A \{brace\} and a \\slash.\par}`
    expect(rtfToParagraphs(rtf)).toEqual(['A {brace} and a \\slash.'])
  })

  it('drops empty paragraphs and is empty-safe', () => {
    expect(rtfToParagraphs(String.raw`{\rtf1 \par \par Only one.\par\par}`)).toEqual(['Only one.'])
    expect(rtfToParagraphs('')).toEqual([])
  })
})
