import { Label } from '@/components/ui/label'
import { Dial } from '@/components/common/dial'
import {
  DEFAULT_TYPE,
  FACE_OPTIONS,
  faceFamily,
  LEADING_RANGE,
  PROSE_SCALE_RANGE,
  typeIsDefault,
} from '@/features/theme/lib/typography'
import { cn } from '@/lib/utils'
import type { ThemeType } from '@/types'

interface TypographyEditorProps {
  type: ThemeType | undefined
  onChange: (type: ThemeType | undefined) => void
}

/**
 * One face, shown in itself.
 *
 * The label is set in the face it names, which is the only honest way to
 * choose type: a list of names in one font tells you what the fonts are
 * called and nothing at all about what they look like.
 */
function FacePicker({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: string
  onChange: (face: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <Label className="text-xs">{label}</Label>
        <p className="text-[11px] text-muted-foreground/80">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FACE_OPTIONS.map((face) => (
          <button
            key={face.id}
            type="button"
            onClick={() => onChange(face.id)}
            aria-pressed={value === face.id}
            aria-label={`${label}: ${face.label}`}
            data-testid={`face-${id}-${face.id}`}
            style={face.family ? { fontFamily: face.family } : undefined}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs transition-colors',
              value === face.id
                ? 'border-primary bg-primary/10 font-medium text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {face.label}
          </button>
        ))}
      </div>
    </div>
  )
}


/**
 * The faces, and how big the prose sits.
 *
 * The interface and heading faces need no preview pane: this dialog is built
 * out of both, so it re-sets itself as you choose. Prose is the exception —
 * it is the one thing here you cannot see from inside a settings dialog — so
 * it gets a line of real prose at the real size.
 */
export function TypographyEditor({ type, onChange }: TypographyEditorProps) {
  const current = type ?? DEFAULT_TYPE
  const set = (changes: Partial<ThemeType>) => onChange({ ...current, ...changes })
  const readingFamily = faceFamily(current.reading)

  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Typography</h3>
          <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
            Three faces for three jobs. The interface and headings change this dialog as you
            pick them — it is built out of both.
          </p>
        </div>
        {!typeIsDefault(type) && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>

      <FacePicker
        id="ui"
        label="Interface"
        hint="Buttons, labels, the rail. Read in glances, so legible beats characterful."
        value={current.ui}
        onChange={(ui) => set({ ui })}
      />
      <FacePicker
        id="display"
        label="Headings"
        hint="Titles, chapter openers, the book’s front page."
        value={current.display}
        onChange={(display) => set({ display })}
      />
      <FacePicker
        id="reading"
        label="Reading"
        hint="The book’s pages. Left alone, it follows your manuscript typeface."
        value={current.reading}
        onChange={(reading) => set({ reading })}
      />

      <div
        data-testid="reading-preview"
        className="rounded-lg border border-border bg-card px-3 py-2.5"
        style={{
          fontFamily: readingFamily ?? 'var(--editor-font, var(--display-font))',
          fontSize: `calc(1.02rem * ${current.proseScale})`,
          lineHeight: String(1.72 * current.leading),
        }}
      >
        The salt road ran west out of the city and did not stop until the sea.
      </div>

      <div className="space-y-1.5">
        <Dial
          label="Prose size"
          hint="The manuscript and the book, not the rest of the app."
          value={current.proseScale}
          min={PROSE_SCALE_RANGE.min}
          max={PROSE_SCALE_RANGE.max}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(proseScale) => set({ proseScale })}
        />
        <Dial
          label="Line spacing"
          value={current.leading}
          min={LEADING_RANGE.min}
          max={LEADING_RANGE.max}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(leading) => set({ leading })}
        />
      </div>
    </section>
  )
}
