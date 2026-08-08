import { afterEach, describe, expect, it } from 'vitest'

import {
  applyShortcutOverrides,
  comboFromEvent,
  comboIsBindable,
  comboKeys,
  conflictingShortcut,
  effectiveCombo,
  matchesCombo,
  matchesShortcut,
  SHORTCUTS,
  shortcut,
} from './shortcuts'

/** A stand-in for the fields `matchesCombo` reads off a real KeyboardEvent. */
function press(
  key: string,
  mods: { mod?: boolean; shift?: boolean; alt?: boolean } = {},
): KeyboardEvent {
  return {
    key,
    ctrlKey: mods.mod ?? false,
    metaKey: false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
  } as KeyboardEvent
}

describe('matchesCombo', () => {
  it('matches Mod via either Ctrl or Cmd', () => {
    expect(matchesCombo(press('k', { mod: true }), 'Mod+K')).toBe(true)
    expect(
      matchesCombo({ key: 'k', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false } as KeyboardEvent, 'Mod+K'),
    ).toBe(true)
  })

  it('ignores the case of letter keys', () => {
    expect(matchesCombo(press('K', { mod: true }), 'Mod+K')).toBe(true)
    expect(matchesCombo(press('f', { mod: true, shift: true }), 'Mod+Shift+F')).toBe(true)
  })

  it('requires the modifier, not merely tolerates it', () => {
    expect(matchesCombo(press('k'), 'Mod+K')).toBe(false)
  })

  it('does not let a plain combo swallow its Shift variant', () => {
    // The bug this guards against: Mod+F firing on Mod+Shift+F, which would
    // open the scene find bar instead of manuscript-wide search.
    expect(matchesCombo(press('f', { mod: true, shift: true }), 'Mod+F')).toBe(false)
    expect(matchesCombo(press('f', { mod: true }), 'Mod+Shift+F')).toBe(false)
  })

  it('rejects an unwanted Alt', () => {
    expect(matchesCombo(press('k', { mod: true, alt: true }), 'Mod+K')).toBe(false)
  })

  it('handles bare keys and punctuation', () => {
    expect(matchesCombo(press('Escape'), 'Escape')).toBe(true)
    expect(matchesCombo(press('Enter', { shift: true }), 'Shift+Enter')).toBe(true)
    expect(matchesCombo(press('Enter'), 'Shift+Enter')).toBe(false)
    expect(matchesCombo(press('.', { mod: true }), 'Mod+.')).toBe(true)
    expect(matchesCombo(press(',', { mod: true }), 'Mod+,')).toBe(true)
    expect(matchesCombo(press('ArrowRight'), 'ArrowRight')).toBe(true)
  })
})

describe('the shortcut table', () => {
  it('has no duplicate ids', () => {
    const ids = SHORTCUTS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has no two shortcuts claiming the same combo within one group', () => {
    const seen = new Set<string>()
    for (const s of SHORTCUTS) {
      const key = `${s.group}::${s.combo}`
      expect(seen.has(key), `${key} is claimed twice`).toBe(false)
      seen.add(key)
    }
  })

  it('resolves every id back to its definition', () => {
    for (const s of SHORTCUTS) expect(shortcut(s.id).combo).toBe(s.combo)
  })

  it('throws on an unknown id rather than returning undefined', () => {
    // @ts-expect-error deliberately outside the union
    expect(() => shortcut('nope')).toThrow()
  })
})

describe('shortcut overrides', () => {
  afterEach(() => applyShortcutOverrides({}))

  it('uses the default combo until an override arrives, then the override', () => {
    expect(effectiveCombo('toggle-focus-mode')).toBe('Mod+.')
    expect(matchesShortcut(press('.', { mod: true }), 'toggle-focus-mode')).toBe(true)

    applyShortcutOverrides({ 'toggle-focus-mode': 'Mod+M' })
    expect(effectiveCombo('toggle-focus-mode')).toBe('Mod+M')
    expect(matchesShortcut(press('m', { mod: true }), 'toggle-focus-mode')).toBe(true)
    // The old key must actually let go, or both would fire.
    expect(matchesShortcut(press('.', { mod: true }), 'toggle-focus-mode')).toBe(false)
  })
})

describe('conflictingShortcut', () => {
  afterEach(() => applyShortcutOverrides({}))

  it('names the holder when the combo is taken by an overlapping group', () => {
    // Manuscript vs Anywhere: focus-mode may not take the palette's key.
    expect(conflictingShortcut('toggle-focus-mode', 'Mod+K')?.id).toBe('command-palette')
  })

  it('compares combos in canonical form, not as strings', () => {
    expect(conflictingShortcut('toggle-focus-mode', 'Shift+Mod+f')?.id).toBe('search-manuscript')
  })

  it('checks against overridden combos, not the abandoned defaults', () => {
    applyShortcutOverrides({ 'find-in-scene': 'Mod+M' })
    expect(conflictingShortcut('toggle-focus-mode', 'Mod+M')?.id).toBe('find-in-scene')
    // Mod+F is free now that find-in-scene has moved off it.
    expect(conflictingShortcut('toggle-focus-mode', 'Mod+F')).toBeNull()
  })

  it('lets non-overlapping groups share a key', () => {
    // The Reader's ArrowRight never meets a Manuscript shortcut.
    expect(conflictingShortcut('toggle-focus-mode', 'ArrowRight')).toBeNull()
  })
})

describe('comboFromEvent', () => {
  it('waits while only modifiers are down', () => {
    expect(comboFromEvent(press('Control', { mod: true }))).toBeNull()
    expect(comboFromEvent(press('Shift', { shift: true }))).toBeNull()
    expect(comboFromEvent(press('Meta'))).toBeNull()
    expect(comboFromEvent(press('Alt', { alt: true }))).toBeNull()
  })

  it('builds the combo in canonical order', () => {
    expect(comboFromEvent(press('m', { mod: true, shift: true }))).toBe('Mod+Shift+M')
    expect(comboFromEvent(press('F6'))).toBe('F6')
    expect(comboFromEvent(press(' ', { alt: true }))).toBe('Alt+Space')
  })
})

describe('comboIsBindable', () => {
  it('accepts Mod or Alt combos and bare function keys', () => {
    expect(comboIsBindable('Mod+M')).toBe(true)
    expect(comboIsBindable('Alt+P')).toBe(true)
    expect(comboIsBindable('F6')).toBe(true)
    expect(comboIsBindable('Mod+Shift+F12')).toBe(true)
  })

  it('refuses keys that would fire in the middle of typing', () => {
    expect(comboIsBindable('M')).toBe(false)
    expect(comboIsBindable('Shift+M')).toBe(false)
    expect(comboIsBindable('Space')).toBe(false)
    expect(comboIsBindable('F13')).toBe(false)
  })
})

describe('comboKeys', () => {
  it('renders platform-appropriate modifiers', () => {
    expect(comboKeys('Mod+Shift+F', false)).toEqual(['Ctrl', 'Shift', 'F'])
    expect(comboKeys('Mod+Shift+F', true)).toEqual(['⌘', '⇧', 'F'])
  })

  it('renders named keys as symbols where there is one', () => {
    expect(comboKeys('ArrowRight', false)).toEqual(['→'])
    expect(comboKeys('Escape', false)).toEqual(['Esc'])
    expect(comboKeys('Shift+Enter', false)).toEqual(['Shift', '↵'])
    expect(comboKeys('Mod+,', false)).toEqual(['Ctrl', ','])
  })
})
