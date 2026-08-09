import { AlignVerticalSpaceAround, Check, Focus, Save, ScanText, Type } from 'lucide-react'

import { Dial } from '@/components/common/dial'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { EDITOR_FONTS } from '@/lib/editor/fonts'
import { parseTicList } from '@/lib/editor/style-tics'
import { cn } from '@/lib/utils'
import { usePreferencesStore } from '@/stores/preferences-store'
import { ThemeSettings } from '@/features/theme/components/theme-settings'

export function AppearanceSettings() {
  const editorFont = usePreferencesStore((s) => s.editorFont)
  const setEditorFont = usePreferencesStore((s) => s.setEditorFont)
  const typewriterMode = usePreferencesStore((s) => s.typewriterMode)
  const setTypewriterMode = usePreferencesStore((s) => s.setTypewriterMode)
  const dimInactiveParagraphs = usePreferencesStore((s) => s.dimInactiveParagraphs)
  const setDimInactiveParagraphs = usePreferencesStore((s) => s.setDimInactiveParagraphs)
  const autosaveDelayMs = usePreferencesStore((s) => s.autosaveDelayMs)
  const setAutosaveDelayMs = usePreferencesStore((s) => s.setAutosaveDelayMs)
  const styleTics = usePreferencesStore((s) => s.styleTics)
  const setStyleTics = usePreferencesStore((s) => s.setStyleTics)

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
          <Type className="size-3.5" /> Manuscript typeface
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Applies to the manuscript editor and Almanac entries. Theme (light/dark/system) lives in
          the toggle at the bottom of the left rail.
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {EDITOR_FONTS.map((font) => (
            <button
              key={font.id}
              type="button"
              onClick={() => setEditorFont(font.id)}
              className={cn(
                'relative rounded-lg border border-border p-3 text-left shadow-xs transition-[border-color,box-shadow] hover:border-foreground/20',
                editorFont === font.id && 'border-primary ring-1 ring-primary',
              )}
            >
              {editorFont === font.id && (
                <Check className="absolute right-2 top-2 size-3.5 text-primary" />
              )}
              <p className="text-xs text-muted-foreground">{font.label}</p>
              <p className="mt-1 truncate text-xl" style={{ fontFamily: font.cssFamily }}>
                Aa Bb Cc
              </p>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Focus className="size-3.5" /> Focus mode
          </div>
          <p className="text-xs text-muted-foreground">
            Fine-tune the distraction-free writing view, toggled with Ctrl+. (or the expand icon
            in the editor toolbar).
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
          <div className="min-w-0">
            <Label htmlFor="typewriter-mode" className="text-sm font-medium">
              Typewriter scrolling
            </Label>
            <p className="text-xs text-muted-foreground">
              Keeps your cursor centered in the viewport as you type, like a typewriter carriage.
            </p>
          </div>
          <Switch id="typewriter-mode" checked={typewriterMode} onCheckedChange={setTypewriterMode} />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
          <div className="min-w-0">
            <Label htmlFor="dim-paragraphs" className="flex items-center gap-1.5 text-sm font-medium">
              <AlignVerticalSpaceAround className="size-3.5" /> Dim other paragraphs
            </Label>
            <p className="text-xs text-muted-foreground">
              Fades everything except the paragraph you're currently writing in.
            </p>
          </div>
          <Switch
            id="dim-paragraphs"
            checked={dimInactiveParagraphs}
            onCheckedChange={setDimInactiveParagraphs}
          />
        </div>
      </section>

      <section id="setting-autosave" className="space-y-3 border-t border-border pt-6">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Save className="size-3.5" /> Autosave
          </h2>
          <p className="text-xs text-muted-foreground">
            How long the editor waits after your last keystroke before writing the scene to
            storage. Shorter is safer; longer is quieter on slow disks.
          </p>
        </div>
        <div className="max-w-sm">
          <Dial
            label="Autosave delay"
            value={autosaveDelayMs}
            min={200}
            max={3000}
            step={100}
            format={(ms) => `${(ms / 1000).toFixed(1)}s`}
            onChange={setAutosaveDelayMs}
          />
        </div>
      </section>

      <section className="space-y-3 border-t border-border/70 pt-6">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <ScanText className="size-3.5" /> Style tics
          </h2>
          <p className="text-xs text-muted-foreground">
            Your own watchlist of words you lean on — "just", "suddenly", a pet phrase. Every
            one gets a wavy underline in the editor so the habit stops hiding. Nothing is ever
            changed for you; seeing it is the point. One per line, or comma-separated.
          </p>
        </div>
        <Textarea
          aria-label="Style tics watchlist"
          value={styleTics.join('\n')}
          onChange={(e) => setStyleTics(parseTicList(e.target.value))}
          placeholder={'just\nsuddenly\nvery\nsomehow'}
          rows={5}
          className="max-w-sm font-mono text-sm"
        />
        {styleTics.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Watching {styleTics.length} word{styleTics.length === 1 ? '' : 's'}.
          </p>
        )}
      </section>

      <div className="border-t border-border/70 pt-6">
        <ThemeSettings />
      </div>
    </div>
  )
}
