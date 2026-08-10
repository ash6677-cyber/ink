import { describe, expect, it } from 'vitest'

import {
  binderToManuscript,
  findDraft,
  parseScrivx,
  type ScrivItem,
} from '@/features/import/lib/scrivener'

const SCRIVX = `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0">
  <Binder>
    <BinderItem UUID="AAA-1" Type="DraftFolder" Created="2025-01-01">
      <Title>Manuscript</Title>
      <Children>
        <BinderItem UUID="BBB-1" Type="Folder">
          <Title>Chapter One &amp; Then</Title>
          <Children>
            <BinderItem UUID="CCC-1" Type="Text">
              <Title>Opening scene</Title>
            </BinderItem>
            <BinderItem UUID="CCC-2" Type="Text">
              <Title>Second scene</Title>
              <MetaData><IncludeInCompile>No</IncludeInCompile></MetaData>
            </BinderItem>
          </Children>
        </BinderItem>
        <BinderItem UUID="DDD-1" Type="Text">
          <Title>Interlude</Title>
        </BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="EEE-1" Type="ResearchFolder">
      <Title>Research</Title>
      <Children>
        <BinderItem UUID="FFF-1" Type="Text"><Title>Notes</Title></BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>`

describe('parseScrivx', () => {
  it('builds the binder tree with attributes, titles, and entities decoded', () => {
    const roots = parseScrivx(SCRIVX)
    expect(roots).toHaveLength(2)
    const draft = roots[0]
    expect(draft.type).toBe('DraftFolder')
    expect(draft.title).toBe('Manuscript')
    expect(draft.children.map((c) => c.title)).toEqual(['Chapter One & Then', 'Interlude'])
    expect(draft.children[0].children.map((c) => c.id)).toEqual(['CCC-1', 'CCC-2'])
  })

  it('reads IncludeInCompile exclusions', () => {
    const draft = parseScrivx(SCRIVX)[0]
    const [s1, s2] = draft.children[0].children
    expect(s1.inCompile).toBe(true)
    expect(s2.inCompile).toBe(false)
  })
})

describe('findDraft', () => {
  it('finds the DraftFolder among the roots', () => {
    expect(findDraft(parseScrivx(SCRIVX))?.id).toBe('AAA-1')
  })

  it('falls back to an item titled Manuscript when no type says draft', () => {
    const roots: ScrivItem[] = [
      { id: '1', type: 'Folder', title: 'Manuscript', inCompile: true, children: [] },
    ]
    expect(findDraft(roots)?.id).toBe('1')
  })

  it('returns null when there is nothing draft-like', () => {
    expect(findDraft([])).toBeNull()
  })
})

describe('binderToManuscript', () => {
  const bodies: Record<string, string[]> = {
    'CCC-1': ['It began on a Tuesday.', 'Nobody believed it.'],
    'CCC-2': ['Cut this scene.'],
    'DDD-1': ['A short interlude passage.'],
    'FFF-1': ['Research notes that must not appear.'],
  }
  const read = (item: ScrivItem) => bodies[item.id] ?? []

  it('maps folders to chapters and texts to scenes, skipping non-compile items', () => {
    const draft = findDraft(parseScrivx(SCRIVX))
    if (!draft) throw new Error('draft must exist in this fixture')
    const manuscript = binderToManuscript(draft, read, 'My Project')
    expect(manuscript.method).toBe('binder')
    expect(manuscript.title).toBe('My Project')
    expect(manuscript.chapters.map((c) => c.title)).toEqual(['Chapter One & Then', 'Interlude'])
    // The excluded scene stays behind.
    expect(manuscript.chapters[0].scenes.map((s) => s.title)).toEqual(['Opening scene'])
    // A loose text at the draft root becomes a one-scene chapter.
    expect(manuscript.chapters[1].scenes).toHaveLength(1)
    expect(manuscript.wordCount).toBeGreaterThan(0)
  })

  it('drops folders whose documents are all empty', () => {
    const draft: ScrivItem = {
      id: 'd',
      type: 'DraftFolder',
      title: 'Draft',
      inCompile: true,
      children: [
        {
          id: 'f',
          type: 'Folder',
          title: 'Ghost chapter',
          inCompile: true,
          children: [
            { id: 't', type: 'Text', title: 'Empty', inCompile: true, children: [] },
          ],
        },
      ],
    }
    const manuscript = binderToManuscript(draft, () => [], 'X')
    expect(manuscript.chapters).toEqual([])
  })
})
