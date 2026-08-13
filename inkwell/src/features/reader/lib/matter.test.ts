import { describe, expect, it } from 'vitest'

import type { BookChapter } from './compile-book'
import { emptyMatter, hasAnyMatter, normalizeMatter, withMatter } from './matter'

const story: BookChapter[] = [
  { id: 'c1', title: 'Chapter 1', kind: 'chapter', number: 1, scenes: [], wordCount: 900 },
  { id: 'c2', title: 'Chapter 2', kind: 'chapter', number: 2, scenes: [], wordCount: 1100 },
]

describe('withMatter', () => {
  it('returns the book untouched when there is no matter at all', () => {
    expect(withMatter(story, null)).toBe(story)
    expect(withMatter(story, emptyMatter())).toBe(story)
    expect(withMatter(story, { dedication: '   ' })).toBe(story)
  })

  it('wraps the story: front matter before, back matter after', () => {
    const book = withMatter(story, {
      dedication: 'For Ada.',
      epigraph: 'The owl of Minerva flies at dusk.',
      acknowledgments: 'Thanks to the Tuesday group.',
      aboutAuthor: 'A. Writer lives by the sea.',
    })
    expect(book.map((c) => c.title)).toEqual([
      'Dedication',
      'Epigraph',
      'Chapter 1',
      'Chapter 2',
      'Acknowledgments',
      'About the Author',
    ])
  })

  it('only includes the sections that were actually written', () => {
    const book = withMatter(story, { dedication: 'For Ada.' })
    expect(book.map((c) => c.title)).toEqual(['Dedication', 'Chapter 1', 'Chapter 2'])
  })

  it('gives matter chapters no number and no word count', () => {
    const book = withMatter(story, { dedication: 'For Ada.' })
    expect(book[0].number).toBeNull()
    expect(book[0].wordCount).toBe(0)
    expect(book[0].scenes[0].wordCount).toBe(0)
  })

  it('sets the epigraph attribution as its own closing line', () => {
    const book = withMatter(story, {
      epigraph: 'The owl of Minerva flies at dusk.',
      epigraphAttribution: 'Hegel, roughly',
    })
    expect(book[0].scenes[0].plainText).toBe(
      'The owl of Minerva flies at dusk.\n\n— Hegel, roughly',
    )
  })

  it('splits multi-paragraph matter into real paragraphs in the doc', () => {
    const book = withMatter(story, { acknowledgments: 'First thanks.\n\nSecond thanks.' })
    const doc = book[2].scenes[0].content as { content: unknown[] }
    expect(doc.content).toHaveLength(2)
  })

  it('renders text a reader can meet: scenes carry plainText', () => {
    const book = withMatter(story, { aboutAuthor: 'A. Writer lives by the sea.' })
    const about = book[book.length - 1]
    expect(about.scenes[0].plainText).toContain('lives by the sea')
  })
})

describe('normalizeMatter / hasAnyMatter', () => {
  it('fills missing fields with empty strings', () => {
    expect(normalizeMatter({ dedication: 'x' }).epigraph).toBe('')
    expect(normalizeMatter(undefined)).toEqual(emptyMatter())
  })

  it('judges emptiness on content, not on whitespace or the attribution', () => {
    expect(hasAnyMatter(null)).toBe(false)
    expect(hasAnyMatter({ dedication: '  ' })).toBe(false)
    // An attribution with no epigraph is not matter on its own.
    expect(hasAnyMatter({ epigraphAttribution: 'Hegel' })).toBe(false)
    expect(hasAnyMatter({ aboutAuthor: 'text' })).toBe(true)
  })
})
