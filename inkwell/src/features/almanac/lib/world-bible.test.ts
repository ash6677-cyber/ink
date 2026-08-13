import { describe, expect, it } from 'vitest'

import type { CodexEntry, Project, Scene } from '@/types'

import { compileWorldBible, PORTRAIT_BOX } from './world-bible'

const project = { title: 'The Two Rivers', author: 'A. Writer' } as Project

let n = 0
const entry = (overrides: Partial<CodexEntry>): CodexEntry => ({
  id: `e-${++n}`,
  createdAt: n,
  updatedAt: n,
  projectId: 'p1',
  seriesId: null,
  type: 'character',
  name: `Entry ${n}`,
  aliases: [],
  summary: '',
  body: null,
  plainText: '',
  attributes: [],
  relationships: [],
  imageId: null,
  tags: [],
  aiContext: 'when-relevant',
  aiContextTokenBudget: null,
  ...overrides,
})

const scene = (overrides: Partial<Scene>): Scene =>
  ({
    id: `s-${++n}`,
    chapterId: 'c1',
    title: `Scene ${n}`,
    storyDay: null,
    ...overrides,
  }) as Scene

const compile = (entries: CodexEntry[], scenes: Scene[] = []) =>
  compileWorldBible({
    project,
    entries,
    scenes,
    chapterTitles: new Map([['c1', 'Chapter 1']]),
    imageSizes: new Map([['img-1', { width: 200, height: 300 }]]),
  })

describe('compileWorldBible', () => {
  it('opens each populated section and gives every entry its own chapter', () => {
    const bible = compile([
      entry({ type: 'character', name: 'Marta', summary: 'The ferryman.' }),
      entry({ type: 'location', name: 'The Ford' }),
    ])
    expect(bible.chapters.map((c) => c.title)).toEqual([
      'Characters', 'Marta', 'Places', 'The Ford',
    ])
    expect(bible.chapters[0].paragraphs).toEqual(['Marta - The ferryman.'])
    expect(bible.entryCount).toBe(2)
  })

  it('skips sections with no entries at all', () => {
    const bible = compile([entry({ type: 'item', name: 'The Locket' })])
    expect(bible.chapters.map((c) => c.title)).toEqual(['Items', 'The Locket'])
  })

  it('lays out aliases, summary, attributes and named relationships', () => {
    const marta = entry({ name: 'Marta', aliases: ['The Ferryman'], summary: 'Keeps the ford.' })
    const bram = entry({
      name: 'Bram',
      relationships: [{ id: 'r1', targetEntryId: marta.id, label: 'Brother of' }],
      attributes: [{ id: 'a1', key: 'Eyes', value: 'grey' }],
    })
    const bible = compile([marta, bram])
    const bramChapter = bible.chapters.find((c) => c.title === 'Bram')!
    expect(bramChapter.paragraphs).toContain('Eyes: grey')
    expect(bramChapter.paragraphs).toContain('Brother of - Marta')
    const martaChapter = bible.chapters.find((c) => c.title === 'Marta')!
    expect(martaChapter.paragraphs[0]).toBe('Also known as The Ferryman.')
  })

  it('drops relationships whose target entry is gone, never a blank name', () => {
    const bible = compile([
      entry({ name: 'Bram', relationships: [{ id: 'r1', targetEntryId: 'gone', label: 'Knows' }] }),
    ])
    const bram = bible.chapters.find((c) => c.title === 'Bram')!
    expect(bram.paragraphs.join(' ')).not.toContain('Knows')
  })

  it('sets a portrait scaled into the box, keeping its shape', () => {
    const bible = compile([entry({ name: 'Marta', imageId: 'img-1' })])
    const marta = bible.chapters.find((c) => c.title === 'Marta')!
    expect(marta.art).toEqual({
      key: 'img-1',
      width: PORTRAIT_BOX,
      height: Math.round(PORTRAIT_BOX * 1.5),
    })
  })

  it('compiles the relationship web once, alphabetically', () => {
    const a = entry({ name: 'Ana' })
    const b = entry({
      name: 'Bram',
      relationships: [{ id: 'r1', targetEntryId: a.id, label: 'Owes' }],
    })
    const bible = compile([a, b])
    const webChapter = bible.chapters.find((c) => c.title === 'The Web of Relationships')!
    expect(webChapter.paragraphs).toEqual(['Bram - Owes - Ana'])
  })

  it('ends with the timeline of dated scenes in story order', () => {
    const bible = compile(
      [entry({ name: 'Marta' })],
      [scene({ title: 'The Funeral', storyDay: 12 }), scene({ title: 'The Death', storyDay: 3 })],
    )
    const timeline = bible.chapters[bible.chapters.length - 1]
    expect(timeline.title).toBe('The Timeline')
    expect(timeline.paragraphs).toEqual([
      'Day 3 - The Death (Chapter 1)',
      'Day 12 - The Funeral (Chapter 1)',
    ])
  })

  it('gives an unwritten entry an honest placeholder page', () => {
    const bible = compile([entry({ name: 'Marta' })])
    expect(bible.chapters.find((c) => c.title === 'Marta')!.paragraphs).toEqual([
      'Nothing written yet.',
    ])
  })

  it('names the document after the book', () => {
    expect(compile([]).title).toBe('The Two Rivers: The World')
  })
})
