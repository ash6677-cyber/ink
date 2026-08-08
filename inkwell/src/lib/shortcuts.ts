/**
 * The single source of truth for keyboard shortcuts.
 *
 * Both the handlers that implement a shortcut and the reference table in
 * Settings read from this list, so the documentation cannot drift away from
 * what the app actually does.
 *
 * Combos are written with `Mod` for "Cmd on macOS, Ctrl everywhere else",
 * plus optional `Shift` / `Alt`, ending in a key name matching
 * `KeyboardEvent.key` (single letters are compared case-insensitively).
 */

export type ShortcutId =
  | 'command-palette'
  | 'toggle-sidebar'
  | 'settings'
  | 'new-project'
  | 'toggle-focus-mode'
  | 'find-in-scene'
  | 'search-manuscript'
  | 'find-next'
  | 'find-previous'
  | 'close-overlay'
  | 'reader-next-page'
  | 'reader-previous-page'
  | 'chat-send'
  | 'chat-newline'
  | 'import-library'
  | 'export-library'
  | 'quit'

export type ShortcutGroup = 'Anywhere' | 'Manuscript' | 'Reader' | 'Character chat'

export interface ShortcutDef {
  id: ShortcutId
  combo: string
  label: string
  group: ShortcutGroup
  /** Only wired up in the packaged desktop app. */
  desktopOnly?: boolean
  /** Shown beneath the label when the shortcut needs a caveat. */
  note?: string
  /**
   * Whether Settings offers to rebind it. Editing keys (Enter, Escape, the
   * reader's arrows) stay fixed because remapping them fights the editor and
   * the platform; desktop-only items live on the native menu bar, whose
   * accelerators are baked in at startup.
   */
  customizable?: boolean
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'command-palette', combo: 'Mod+K', label: 'Open the command palette', group: 'Anywhere', customizable: true },
  { id: 'toggle-sidebar', combo: 'Mod+B', label: 'Collapse or expand the sidebar', group: 'Anywhere', customizable: true },
  { id: 'settings', combo: 'Mod+,', label: 'Open Settings', group: 'Anywhere', customizable: true },
  {
    id: 'new-project',
    combo: 'Mod+N',
    label: 'Start a new project',
    group: 'Anywhere',
    desktopOnly: true,
    note: 'Browsers reserve this combination for a new window.',
  },
  {
    id: 'import-library',
    combo: 'Mod+I',
    label: 'Import a library file',
    group: 'Anywhere',
    desktopOnly: true,
    note: 'In the browser, use Settings → Data.',
  },
  {
    id: 'export-library',
    combo: 'Mod+Shift+E',
    label: 'Export your whole library',
    group: 'Anywhere',
    desktopOnly: true,
    note: 'In the browser, use Settings → Data.',
  },
  { id: 'quit', combo: 'Mod+Q', label: 'Save and quit', group: 'Anywhere', desktopOnly: true },

  { id: 'toggle-focus-mode', combo: 'Mod+.', label: 'Toggle focus mode', group: 'Manuscript', customizable: true },
  { id: 'find-in-scene', combo: 'Mod+F', label: 'Find in this scene', group: 'Manuscript', customizable: true },
  {
    id: 'search-manuscript',
    combo: 'Mod+Shift+F',
    label: 'Search the whole manuscript',
    group: 'Manuscript',
    customizable: true,
  },
  { id: 'find-next', combo: 'Enter', label: 'Jump to the next match', group: 'Manuscript' },
  {
    id: 'find-previous',
    combo: 'Shift+Enter',
    label: 'Jump to the previous match',
    group: 'Manuscript',
  },
  { id: 'close-overlay', combo: 'Escape', label: 'Close the find bar', group: 'Manuscript' },

  {
    id: 'reader-next-page',
    combo: 'ArrowRight',
    label: 'Turn to the next page',
    group: 'Reader',
    note: 'Space and Page Down do the same thing.',
  },
  {
    id: 'reader-previous-page',
    combo: 'ArrowLeft',
    label: 'Turn back a page',
    group: 'Reader',
    note: 'Page Up does the same thing.',
  },

  { id: 'chat-send', combo: 'Enter', label: 'Send the message', group: 'Character chat' },
  {
    id: 'chat-newline',
    combo: 'Shift+Enter',
    label: 'Start a new line instead of sending',
    group: 'Character chat',
  },
]

const BY_ID = new Map(SHORTCUTS.map((shortcut) => [shortcut.id, shortcut]))

export function shortcut(id: ShortcutId): ShortcutDef {
  const found = BY_ID.get(id)
  if (!found) throw new Error(`Unknown shortcut: ${id}`)
  return found
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  'Anywhere',
  'Manuscript',
  'Reader',
  'Character chat',
]

/** Single letters compare case-insensitively; everything else is a `key` name. */
function normalizeKey(key: string): string {
  return key === ' ' ? 'space' : key.toLowerCase()
}

export function matchesCombo(event: KeyboardEvent, combo: string): boolean {
  const parts = combo.split('+')
  const key = parts[parts.length - 1]

  // Every modifier is checked in both directions: Mod+F must not fire when
  // Shift is also down, or it would swallow Mod+Shift+F.
  const wantsMod = parts.includes('Mod')
  const wantsShift = parts.includes('Shift')
  const wantsAlt = parts.includes('Alt')

  if ((event.metaKey || event.ctrlKey) !== wantsMod) return false
  if (event.shiftKey !== wantsShift) return false
  if (event.altKey !== wantsAlt) return false

  return normalizeKey(event.key) === normalizeKey(key)
}

/**
 * A writer's own bindings, layered over the defaults.
 *
 * The map lives here — a plain module variable — rather than in React state
 * because the consumers are raw `window` keydown listeners all over the app.
 * `preferences-store` owns persistence and pushes every change (and the
 * initial load) through `applyShortcutOverrides`; everything else just asks
 * `matchesShortcut` as it always has.
 */
export type ShortcutOverrides = Partial<Record<ShortcutId, string>>

let overrides: ShortcutOverrides = {}

export function applyShortcutOverrides(next: ShortcutOverrides): void {
  overrides = { ...next }
}

/** The combo actually in force: the writer's own binding, or the default. */
export function effectiveCombo(id: ShortcutId): string {
  return overrides[id] ?? shortcut(id).combo
}

export function matchesShortcut(event: KeyboardEvent, id: ShortcutId): boolean {
  return matchesCombo(event, effectiveCombo(id))
}

/** Canonical text form, so 'Shift+Mod+m' and 'Mod+Shift+M' compare equal. */
function normalizeCombo(combo: string): string {
  const parts = combo.split('+')
  const key = normalizeKey(parts[parts.length - 1])
  const mods = ['Mod', 'Shift', 'Alt'].filter((m) => parts.includes(m))
  return [...mods, key].join('+')
}

/**
 * Two shortcuts can only collide where both are listening: 'Anywhere' overlaps
 * everything, and a group overlaps itself. The Reader's arrow keys and a
 * Manuscript binding never meet, so they may share a key in peace.
 */
function groupsOverlap(a: ShortcutGroup, b: ShortcutGroup): boolean {
  return a === b || a === 'Anywhere' || b === 'Anywhere'
}

/**
 * The shortcut that already holds `combo`, if binding it to `id` would clash
 * — checked against *effective* combos, so a conflict with someone's earlier
 * custom binding is caught just like one with a default.
 */
export function conflictingShortcut(id: ShortcutId, combo: string): ShortcutDef | null {
  const own = shortcut(id)
  const wanted = normalizeCombo(combo)
  for (const other of SHORTCUTS) {
    if (other.id === id) continue
    if (!groupsOverlap(own.group, other.group)) continue
    if (normalizeCombo(effectiveCombo(other.id)) === wanted) return other
  }
  return null
}

/**
 * Builds a combo string from a captured keydown, or null while only modifiers
 * are held — capture waits for a real key to arrive.
 */
export function comboFromEvent(event: KeyboardEvent): string | null {
  const key = event.key
  if (key === 'Control' || key === 'Meta' || key === 'Shift' || key === 'Alt') return null
  const parts: string[] = []
  if (event.metaKey || event.ctrlKey) parts.push('Mod')
  if (event.shiftKey) parts.push('Shift')
  if (event.altKey) parts.push('Alt')
  parts.push(key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key)
  return parts.join('+')
}

/**
 * Whether a combo is safe to bind app-wide: it must carry Mod or Alt, or be a
 * function key. A bare letter would fire in the middle of typing prose.
 */
export function comboIsBindable(combo: string): boolean {
  const parts = combo.split('+')
  if (parts.includes('Mod') || parts.includes('Alt')) return true
  return /^F([1-9]|1[0-2])$/.test(parts[parts.length - 1])
}

const KEY_LABELS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Enter: '↵',
  Escape: 'Esc',
  Space: 'Space',
  ',': ',',
  '.': '.',
}

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent)
}

/** Splits a combo into the individual keycaps to render, in press order. */
export function comboKeys(combo: string, apple: boolean): string[] {
  return combo.split('+').map((part) => {
    if (part === 'Mod') return apple ? '⌘' : 'Ctrl'
    if (part === 'Shift') return apple ? '⇧' : 'Shift'
    if (part === 'Alt') return apple ? '⌥' : 'Alt'
    return KEY_LABELS[part] ?? (part.length === 1 ? part.toUpperCase() : part)
  })
}
