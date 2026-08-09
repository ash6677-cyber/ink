import { useTheme } from 'next-themes'

import { usePreferencesStore } from '@/stores/preferences-store'

/**
 * Which palette the book viewer wears: the reader's own remembered choice,
 * or the app theme when no choice has been made. Returned as the island
 * class that re-declares the design tokens for the viewer's subtree only.
 */
export function useReaderThemeClass(): string {
  const { resolvedTheme } = useTheme()
  const readerTheme = usePreferencesStore((s) => s.readerTheme)
  const effective = readerTheme ?? (resolvedTheme === 'dark' ? 'dark' : 'light')
  return effective === 'dark' ? 'reader-theme-dark' : 'reader-theme-light'
}
