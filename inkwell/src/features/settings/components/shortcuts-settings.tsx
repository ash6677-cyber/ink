import { Monitor, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { EmptyState } from '@/components/common/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  comboFromEvent,
  comboIsBindable,
  comboKeys,
  conflictingShortcut,
  isApplePlatform,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  type ShortcutDef,
  type ShortcutId,
} from '@/lib/shortcuts'
import { isTauriRuntime } from '@/lib/db/tauri-bridge'
import { usePreferencesStore } from '@/stores/preferences-store'

function Keycap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-7 items-center justify-center rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium text-foreground shadow-xs">
      {children}
    </kbd>
  )
}

interface ShortcutRowProps {
  shortcut: ShortcutDef
  apple: boolean
  combo: string
  overridden: boolean
  capturing: boolean
  error: string | null
  onStartCapture: () => void
  onReset: () => void
}

function ShortcutRow({
  shortcut,
  apple,
  combo,
  overridden,
  capturing,
  error,
  onStartCapture,
  onReset,
}: ShortcutRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm">{shortcut.label}</p>
        {shortcut.note && <p className="mt-0.5 text-xs text-muted-foreground">{shortcut.note}</p>}
        {capturing && (
          <p className="mt-0.5 text-xs text-primary">
            Press the new keys… <span className="text-muted-foreground">(Esc cancels)</span>
          </p>
        )}
        {error && !capturing && <p className="mt-0.5 text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {shortcut.desktopOnly && (
          <Badge variant="secondary" className="gap-1 text-[10px] font-medium">
            <Monitor className="size-3" /> Desktop
          </Badge>
        )}
        <div className="flex items-center gap-1">
          {capturing ? (
            <Keycap>…</Keycap>
          ) : (
            comboKeys(combo, apple).map((cap, i) => <Keycap key={`${cap}-${i}`}>{cap}</Keycap>)
          )}
        </div>
        {shortcut.customizable && (
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground pointer-coarse:min-h-11 pointer-coarse:px-3"
              onClick={onStartCapture}
            >
              {capturing ? 'Listening…' : 'Change'}
            </Button>
            {overridden && !capturing && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground pointer-coarse:min-h-11 pointer-coarse:px-3"
                onClick={onReset}
              >
                Reset
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function ShortcutsSettings() {
  const [query, setQuery] = useState('')
  const [capturingId, setCapturingId] = useState<ShortcutId | null>(null)
  const [errors, setErrors] = useState<Partial<Record<ShortcutId, string>>>({})

  const overrides = usePreferencesStore((s) => s.shortcutOverrides)
  const setShortcutOverride = usePreferencesStore((s) => s.setShortcutOverride)
  const clearShortcutOverride = usePreferencesStore((s) => s.clearShortcutOverride)

  // Read once per mount: the platform doesn't change under a running app, and
  // this keeps the keycaps from depending on render timing.
  const apple = useMemo(() => isApplePlatform(), [])
  const desktop = useMemo(() => isTauriRuntime(), [])

  // While capturing, the next real keypress is the answer — swallowed before
  // the rest of the app can act on it, or pressing ⌘K to *bind* ⌘K would
  // open the palette over the settings page.
  useEffect(() => {
    if (!capturingId) return
    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturingId(null)
        return
      }
      const combo = comboFromEvent(e)
      if (!combo) return // just a modifier going down; keep listening
      const id = capturingId as ShortcutId
      if (!comboIsBindable(combo)) {
        setErrors((prev) => ({
          ...prev,
          [id]: `${comboKeys(combo, apple).join(' ')} would fire while typing — include ${
            apple ? '⌘' : 'Ctrl'
          } or Alt, or use a function key.`,
        }))
        setCapturingId(null)
        return
      }
      const holder = conflictingShortcut(id, combo)
      if (holder) {
        setErrors((prev) => ({
          ...prev,
          [id]: `${comboKeys(combo, apple).join(' ')} already belongs to “${holder.label}”.`,
        }))
        setCapturingId(null)
        return
      }
      setErrors((prev) => ({ ...prev, [id]: undefined }))
      setShortcutOverride(id, combo)
      setCapturingId(null)
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [capturingId, apple, setShortcutOverride])

  const needle = query.trim().toLowerCase()
  const matches = SHORTCUTS.filter(
    (shortcut) =>
      needle.length === 0 ||
      shortcut.label.toLowerCase().includes(needle) ||
      shortcut.group.toLowerCase().includes(needle) ||
      comboKeys(overrides[shortcut.id] ?? shortcut.combo, apple)
        .join(' ')
        .toLowerCase()
        .includes(needle),
  )

  return (
    <div className="max-w-2xl space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search shortcuts…"
          className="pl-9"
          aria-label="Search shortcuts"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Shortcuts with a <span className="font-medium text-foreground">Change</span> button can be
        rebound; the rest are fixed keys the editor and reader rely on.
      </p>

      {!desktop && (
        <p className="text-xs text-muted-foreground">
          Shortcuts marked <span className="font-medium text-foreground">Desktop</span> are
          available in the INKWELL desktop app, where they live on the native menu bar.
        </p>
      )}

      {matches.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching shortcuts"
          description={`Nothing matches “${query.trim()}”.`}
        />
      ) : (
        SHORTCUT_GROUPS.map((group) => {
          const inGroup = matches.filter((shortcut) => shortcut.group === group)
          if (inGroup.length === 0) return null
          return (
            <Card key={group} className="p-5">
              <h3 className="text-sm font-semibold">{group}</h3>
              <div className="mt-1 divide-y divide-border/70">
                {inGroup.map((shortcut) => (
                  <ShortcutRow
                    key={shortcut.id}
                    shortcut={shortcut}
                    apple={apple}
                    combo={overrides[shortcut.id] ?? shortcut.combo}
                    overridden={Boolean(overrides[shortcut.id])}
                    capturing={capturingId === shortcut.id}
                    error={errors[shortcut.id] ?? null}
                    onStartCapture={() => {
                      setErrors((prev) => ({ ...prev, [shortcut.id]: undefined }))
                      setCapturingId(shortcut.id)
                    }}
                    onReset={() => clearShortcutOverride(shortcut.id)}
                  />
                ))}
              </div>
            </Card>
          )
        })
      )}
    </div>
  )
}
