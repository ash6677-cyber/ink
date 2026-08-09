import { Label } from '@/components/ui/label'
import { Dial } from '@/components/common/dial'
import {
  accentFor,
  applyPreset,
  DEFAULT_DESIGN,
  DESIGN_PRESETS,
  designIsDefault,
  FINISHES,
  FINISH_HINT,
  FINISH_LABEL,
  FRAMES,
  FRAME_HINT,
  FRAME_LABEL,
  generatedAccent,
  matchingPreset,
  normalizeDesign,
} from '@/features/playground/lib/card-design'
import { formatOklch, parseOklch } from '@/features/theme/lib/oklch'
import { cn } from '@/lib/utils'
import type { CardDesign } from '@/types'

interface CardDesignPanelProps {
  design: CardDesign | undefined
  /** Used for the generated accent, so "the app's choice" shows a real colour. */
  name: string
  onChange: (design: CardDesign | undefined) => void
}

/** A ring of hues at the weight generated accents use, so every swatch here
 *  is a colour the card could actually be. */
const HUES = [15, 45, 75, 110, 150, 190, 220, 250, 285, 320, 345]


/**
 * How this character's card is cut, finished and coloured.
 *
 * No preview pane: the card itself is right beside this panel and changes as
 * you choose, which is a truer preview than a swatch and the reason these are
 * live controls rather than a saved guess.
 */
export function CardDesignPanel({ design, name, onChange }: CardDesignPanelProps) {
  const current = normalizeDesign(design)
  const set = (changes: Partial<CardDesign>) => onChange({ ...current, ...changes })
  const shown = accentFor(current, name)
  const wearing = matchingPreset(current)

  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Card design</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            How this character’s card looks, everywhere it appears.
          </p>
        </div>
        {!designIsDefault(design) && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Start from</Label>
        <div className="flex flex-wrap gap-1.5">
          {DESIGN_PRESETS.map((preset) => {
            const chosen = wearing?.id === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChange(applyPreset(current, preset))}
                aria-pressed={chosen}
                title={preset.hint}
                className={cn(
                  'rounded-full border px-2.5 py-1 pointer-coarse:min-h-11 pointer-coarse:px-4 text-xs transition-colors',
                  chosen
                    ? 'border-primary bg-primary/10 font-medium text-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-muted-foreground/80">
          {wearing
            ? wearing.hint
            : 'A look to take rather than build. None of them change this character’s colour.'}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Frame</Label>
        <div className="flex flex-wrap gap-1.5">
          {FRAMES.map((frame) => (
            <button
              key={frame}
              type="button"
              onClick={() => set({ frame })}
              aria-pressed={current.frame === frame}
              aria-label={`Frame: ${FRAME_LABEL[frame]}`}
              className={cn(
                'rounded-full border px-2.5 py-1 pointer-coarse:min-h-11 pointer-coarse:px-4 text-xs transition-colors',
                current.frame === frame
                  ? 'border-primary bg-primary/10 font-medium text-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {FRAME_LABEL[frame]}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground/80">{FRAME_HINT[current.frame]}</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Finish</Label>
        <div className="flex flex-wrap gap-1.5">
          {FINISHES.map((finish) => (
            <button
              key={finish}
              type="button"
              onClick={() => set({ finish })}
              aria-pressed={current.finish === finish}
              aria-label={`Finish: ${FINISH_LABEL[finish]}`}
              className={cn(
                'rounded-full border px-2.5 py-1 pointer-coarse:min-h-11 pointer-coarse:px-4 text-xs transition-colors',
                current.finish === finish
                  ? 'border-primary bg-primary/10 font-medium text-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {FINISH_LABEL[finish]}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground/80">{FINISH_HINT[current.finish]}</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Colour</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => set({ accent: null })}
            aria-pressed={current.accent === null}
            aria-label="Colour: from the name"
            title="A colour of this character's own, from their name"
            className={cn(
              'size-6 rounded-full border-2 transition-transform',
              current.accent === null
                ? 'border-foreground scale-110'
                : 'border-transparent hover:scale-110',
            )}
            style={{ background: generatedAccent(name) }}
          />
          <span className="mr-1 text-[11px] text-muted-foreground/80">auto</span>
          {HUES.map((h) => {
            const value = formatOklch({ l: 0.68, c: 0.13, h, alpha: 1 })
            const chosen = current.accent !== null && parseOklch(current.accent)?.h === h
            return (
              <button
                key={h}
                type="button"
                onClick={() => set({ accent: value })}
                aria-pressed={chosen}
                aria-label={`Colour: hue ${h}`}
                className={cn(
                  'size-6 rounded-full border-2 transition-transform',
                  chosen ? 'border-foreground scale-110' : 'border-transparent hover:scale-110',
                )}
                style={{ background: value }}
              />
            )
          })}
        </div>
        <p className="text-[11px] text-muted-foreground/80">
          {current.accent === null
            ? 'This character’s own colour, taken from their name — the same on every device.'
            : 'Chosen by you.'}
        </p>
      </div>

      <div className="space-y-1.5">
        <Dial
          label="Gloss"
          hint="How hard the finish catches the light."
          value={current.gloss}
          onChange={(gloss) => set({ gloss })}
        />
        <Dial
          label="Vignette"
          hint="The shadow that pulls focus to the face."
          value={current.vignette}
          onChange={(vignette) => set({ vignette })}
        />
      </div>

      <p className="text-[11px] text-muted-foreground/80">
        Showing <span style={{ color: shown }}>■</span> {shown}
        {designIsDefault(design) ? ' · nothing changed yet' : ''}
        {current.gloss === 0 && current.finish !== 'matte'
          ? ' · gloss at zero, so this finish will not show'
          : ''}
      </p>
    </section>
  )
}

export { DEFAULT_DESIGN }
