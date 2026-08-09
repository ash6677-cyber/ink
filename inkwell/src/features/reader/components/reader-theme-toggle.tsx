import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'
import { usePreferencesStore } from '@/stores/preferences-store'

/**
 * The book viewer's own light switch. It changes the pages, not the app:
 * a writer living in a dark app can read on paper-white, a beta reader on
 * a bright phone can dim just the book. The choice is remembered.
 */
export function ReaderThemeToggle() {
  const { resolvedTheme } = useTheme()
  const readerTheme = usePreferencesStore((s) => s.readerTheme)
  const setReaderTheme = usePreferencesStore((s) => s.setReaderTheme)

  const effective = readerTheme ?? (resolvedTheme === 'dark' ? 'dark' : 'light')
  const dark = effective === 'dark'

  return (
    <Button
      variant="outline"
      size="sm"
      aria-label={dark ? 'Switch the book to light pages' : 'Switch the book to dark pages'}
      onClick={() => setReaderTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
      {dark ? 'Light pages' : 'Dark pages'}
    </Button>
  )
}
