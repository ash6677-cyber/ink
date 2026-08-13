import { beforeEach, describe, expect, it } from 'vitest'

import {
  approxTokens,
  buildChapterMessages,
  buildLetterMessages,
  clearReadThroughState,
  emptyReadThroughState,
  estimateCost,
  estimateReadThrough,
  loadReadThroughState,
  parseChapterReply,
  saveReadThroughState,
} from './read-through'

const chapter = (title: string, words: number) => ({
  title,
  text: Array.from({ length: words }, (_, i) => `word${i}`).join(' '),
})

describe('estimateReadThrough', () => {
  it('is computable before anything runs, from text alone', () => {
    const estimate = estimateReadThrough([chapter('One', 1000), chapter('Two', 2000)])
    expect(estimate.chapters).toBe(2)
    expect(estimate.inputTokens).toBeGreaterThan(approxTokens('x'.repeat(4000)))
    expect(estimate.outputTokens).toBeGreaterThan(0)
  })

  it('prices at the writer’s own rate, per million tokens', () => {
    const estimate = { chapters: 1, inputTokens: 900_000, outputTokens: 100_000 }
    expect(estimateCost(estimate, 3)).toBeCloseTo(3)
    expect(estimateCost(estimate, 0)).toBe(0)
  })
})

describe('buildChapterMessages', () => {
  it('carries the running memory into every pass after the first', () => {
    const first = buildChapterMessages('', chapter('One', 10), 0, 3)
    expect(first[1].content).toContain('This is the first chapter.')
    const later = buildChapterMessages('Ana owes Bram a locket.', chapter('Two', 10), 1, 3)
    expect(later[1].content).toContain('Ana owes Bram a locket.')
    expect(later[1].content).toContain('Chapter 2 of 3')
  })

  it('demands the two-part NOTES/MEMORY reply the parser expects', () => {
    const [system] = buildChapterMessages('', chapter('One', 5), 0, 1)
    expect(system.content).toContain('NOTES:')
    expect(system.content).toContain('MEMORY:')
  })
})

describe('parseChapterReply', () => {
  it('splits notes from the updated memory', () => {
    const { note, memory } = parseChapterReply(
      'NOTES: The opening drags.\nMEMORY: Ana owes Bram a locket.',
    )
    expect(note).toBe('The opening drags.')
    expect(memory).toBe('Ana owes Bram a locket.')
  })

  it('keeps the note and an empty memory when the model forgets the mark', () => {
    const { note, memory } = parseChapterReply('NOTES: Fine chapter.')
    expect(note).toBe('Fine chapter.')
    expect(memory).toBe('')
  })
})

describe('buildLetterMessages', () => {
  it('feeds every chapter note in, tied to its chapter, and demands citations', () => {
    const messages = buildLetterMessages(
      [
        { chapterIndex: 0, chapterTitle: 'The Ford', note: 'Strong opening.' },
        { chapterIndex: 1, chapterTitle: 'The Keep', note: 'Middle sags.' },
      ],
      'Threads: the locket.',
    )
    expect(messages[1].content).toContain('Chapter 1 — The Ford')
    expect(messages[1].content).toContain('Chapter 2 — The Keep')
    expect(messages[0].content).toContain('(Chapter N)')
  })
})

describe('read-through state', () => {
  const fakeStorage = () => {
    const data = new Map<string, string>()
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    }
  }
  let storage: ReturnType<typeof fakeStorage>
  beforeEach(() => {
    storage = fakeStorage()
  })

  it('round-trips through storage so an interrupted run resumes', () => {
    const state = emptyReadThroughState(3)
    state.nextChapter = 2
    state.memory = 'so far'
    state.notes.push({ chapterIndex: 0, chapterTitle: 'One', note: 'n' })
    saveReadThroughState('p1', state, storage)
    expect(loadReadThroughState('p1', 3, storage)).toEqual(state)
  })

  it('refuses to resume onto a book whose shape changed', () => {
    saveReadThroughState('p1', { ...emptyReadThroughState(3), nextChapter: 2 }, storage)
    expect(loadReadThroughState('p1', 4, storage)).toBeNull()
  })

  it('clears cleanly', () => {
    saveReadThroughState('p1', emptyReadThroughState(2), storage)
    clearReadThroughState('p1', storage)
    expect(loadReadThroughState('p1', 2, storage)).toBeNull()
  })
})
