import { AlignVerticalSpaceAround, Check, Focus, Save, Type } from 'lucide-react'

import { Dial } from '@/components/common/dial'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { EDITOR_FONTS } from '@/lib/editor/fonts'
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

      <div className="border-t border-border/70 pt-6">
        <ThemeSettings />
      </div>
    </div>
  )
}
