import { describe, expect, it } from 'vitest'

import { CURRENT_SCHEMA_VERSION, emptyLibrary, migrateLibrary } from './library-schema'

/** A real pre-Phase-7 shape: no lorebooks/personas/cardChats/covers tables
 * existed yet, and this project predates the chapters-only structure mode. */
function v0LibraryFixture() {
  return {
    projects: [
      {
        id: 'p1',
        title: 'Old Book',
        author: '',
        synopsis: '',
        genre: '',
        targetWordCount: 80000,
        coverId: null,
        seriesId: null,
  seriesOrder: 0,
        status: 'drafting',
        settings: { defaultAiPresetId: null, pov: 'first', tense: 'past', measureWidthCh: 68 },
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    chapters: [{ id: 'c1', projectId: 'p1', title: 'Ch 1', order: 0, status: 'outline', createdAt: 1, updatedAt: 1 }],
    scenes: [],
    // lorebooks/personas/cardChats/covers/etc. deliberately absent
  }
}

describe('migrateLibrary', () => {
  it('fills in missing tables and defaults on a v0 document', () => {
    const migrated = migrateLibrary(v0LibraryFixture())

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrated.lorebooks).toEqual([])
    expect(migrated.personas).toEqual([])
    expect(migrated.cardChats).toEqual([])
    expect(migrated.covers).toEqual([])
    expect(migrated.projects).toHaveLength(1)
    expect(migrated.projects[0].settings.structureMode).toBe('scenes')
    // Pre-existing data must survive untouched, not just get defaults bolted on.
    expect(migrated.projects[0].title).toBe('Old Book')
    expect(migrated.chapters).toHaveLength(1)
    expect(migrated.chapters[0].title).toBe('Ch 1')
  })

  it('is idempotent on an already-current document', () => {
    const current = emptyLibrary()
    current.projects.push({
      id: 'p1',
      title: 'Current Book',
      author: '',
      synopsis: '',
      genre: '',
      targetWordCount: 1000,
      coverId: null,
      seriesId: null,
  seriesOrder: 0,
      status: 'planning',
      settings: { defaultAiPresetId: null, pov: 'first', tense: 'past', measureWidthCh: 68, structureMode: 'chapters-only' },
      createdAt: 1,
      updatedAt: 1,
    })

    const migrated = migrateLibrary(current)

    expect(migrated).toEqual(current)
  })

  it('backfills tables added after a document was already current', () => {
    // A document saved at the current schema version before newer tables
    // existed skips every migration step — the unconditional backfill is
    // what keeps it loadable. `promises` is exactly such a late addition.
    const doc = { ...v0LibraryFixture(), schemaVersion: CURRENT_SCHEMA_VERSION }
    const migrated = migrateLibrary(doc)
    expect(migrated.promises).toEqual([])
    expect(migrated.revisionPasses).toEqual([])
    expect(migrated.themes).toEqual([])
    expect(migrated.projects[0].title).toBe('Old Book')
  })

  it('never throws on garbage input and returns a valid empty-shaped document', () => {
    for (const input of [null, undefined, 'not an object', 42, [], {}]) {
      const migrated = migrateLibrary(input)
      expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
      expect(Array.isArray(migrated.projects)).toBe(true)
      expect(Array.isArray(migrated.lorebooks)).toBe(true)
    }
  })
})
