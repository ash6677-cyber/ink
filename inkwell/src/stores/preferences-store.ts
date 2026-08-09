import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { DEFAULT_EDITOR_FONT_ID } from '@/lib/editor/fonts'
import type { AiFeature, FeaturePresetMap } from '@/lib/ai/feature-preset'
import {
  applyShortcutOverrides,
  type ShortcutId,
  type ShortcutOverrides,
} from '@/lib/shortcuts'

interface PreferencesState {
  editorFont: string
  typewriterMode: boolean
  dimInactiveParagraphs: boolean
  /** When the whole library was last exported to a file, or null if never. */
  lastBackupAt: number | null
  /** Epoch ms until which the backup reminder stays hidden. */
  backupSnoozedUntil: number
  /** The format the last manuscript export used. The next one starts there. */
  lastExportFormat: string | null
  /**
   * Whether the sample book has had its one chance to exist — set when it
   * is seeded, and equally when a library proves it never needed one.
   * Deleting the sample must never resurrect it.
   */
  sampleBookOffered: boolean
  /** The writer's own key bindings, by shortcut id; absent means default. */
  shortcutOverrides: ShortcutOverrides
  /** How long the editor waits after the last keystroke before saving. */
  autosaveDelayMs: number
  /** Per-feature AI preset choices; a feature not in the map follows the
   * global default preset. */
  featurePresets: FeaturePresetMap
  setEditorFont: (id: string) => void
  setShortcutOverride: (id: ShortcutId, combo: string) => void
  setAutosaveDelayMs: (ms: number) => void
  setFeaturePreset: (feature: AiFeature, presetId: string | null) => void
  clearShortcutOverride: (id: ShortcutId) => void
  setTypewriterMode: (value: boolean) => void
  setDimInactiveParagraphs: (value: boolean) => void
  markBackedUp: () => void
  rememberExportFormat: (format: string) => void
  snoozeBackupReminder: (days: number) => void
  markSampleBookOffered: () => void
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      editorFont: DEFAULT_EDITOR_FONT_ID,
      typewriterMode: false,
      dimInactiveParagraphs: false,
      lastBackupAt: null,
      backupSnoozedUntil: 0,
      lastExportFormat: null,
      sampleBookOffered: false,
      shortcutOverrides: {},
      autosaveDelayMs: 800,
      featurePresets: {},
      setEditorFont: (id) => set({ editorFont: id }),
      setAutosaveDelayMs: (ms) => set({ autosaveDelayMs: Math.min(5000, Math.max(200, ms)) }),
      setFeaturePreset: (feature, presetId) =>
        set((s) => {
          const next = { ...s.featurePresets }
          if (presetId) next[feature] = presetId
          else delete next[feature]
          return { featurePresets: next }
        }),
      setShortcutOverride: (id, combo) =>
        set((s) => {
          const next = { ...s.shortcutOverrides, [id]: combo }
          applyShortcutOverrides(next)
          return { shortcutOverrides: next }
        }),
      clearShortcutOverride: (id) =>
        set((s) => {
          const next = { ...s.shortcutOverrides }
          delete next[id]
          applyShortcutOverrides(next)
          return { shortcutOverrides: next }
        }),
      setTypewriterMode: (value) => set({ typewriterMode: value }),
      setDimInactiveParagraphs: (value) => set({ dimInactiveParagraphs: value }),
      markBackedUp: () => set({ lastBackupAt: Date.now(), backupSnoozedUntil: 0 }),
      rememberExportFormat: (format) => set({ lastExportFormat: format }),
      snoozeBackupReminder: (days) =>
        set({ backupSnoozedUntil: Date.now() + days * 24 * 60 * 60 * 1000 }),
      markSampleBookOffered: () => set({ sampleBookOffered: true }),
    }),
    {
      name: 'inkwell-preferences',
      // The keydown listeners read a module-level map, not React state, so
      // the saved bindings have to be pushed into it the moment they load —
      // otherwise every custom key would revert to default until the writer
      // happened to open Settings.
      onRehydrateStorage: () => (state) => {
        applyShortcutOverrides(state?.shortcutOverrides ?? {})
      },
    },
  ),
)
