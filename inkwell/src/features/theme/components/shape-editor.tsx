import { Label } from '@/components/ui/label'
import { Dial } from '@/components/common/dial'
import {
  DEFAULT_SHAPE,
  DEPTH_HINT,
  DEPTH_LABEL,
  shapeIsDefault,
} from '@/features/theme/lib/shape'
import { cn } from '@/lib/utils'
import type { ThemeDepth, ThemeShape } from '@/types'

interface ShapeEditorProps {
  shape: ThemeShape | undefined
  onChange: (shape: ThemeShape | undefined) => void
}

const DEPTHS: ThemeDepth[] = ['flat', 'soft', 'lifted', 'dramatic']


/**
 * Rounding, depth, wash, motion and size.
 *
 * No preview pane. Every one of these changes the dialog you are standing in
 * as you drag it — the corners of this panel round, its shadow deepens, the
 * whole thing grows — which is a truer preview than any swatch, and the
 * reason these are worth having as live controls rather than a saved guess.
 */
export function ShapeEditor({ shape, onChange }: ShapeEditorProps) {
  const current = shape ?? DEFAULT_SHAPE
  const set = (changes: Partial<ThemeShape>) => onChange({ ...current, ...changes })

  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Shape</h3>
          <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
            How rounded, how deep, how fast and how big. Everything here changes this dialog
            as you drag it, which is the best preview there is.
          </p>
        </div>
        {!shapeIsDefault(shape) && (
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
        <Label className="text-xs">Depth</Label>
        <div className="flex flex-wrap gap-1.5">
          {DEPTHS.map((depth) => (
            <button
              key={depth}
              type="button"
              onClick={() => set({ depth })}
              aria-pressed={current.depth === depth}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                current.depth === depth
                  ? 'border-primary bg-primary/10 font-medium text-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {DEPTH_LABEL[depth]}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground/80">{DEPTH_HINT[current.depth]}</p>
      </div>

      <div className="space-y-1.5">
        <Dial
          label="Interface corners"
          value={current.radius}
          min={0}
          max={24}
          step={1}
          format={(v) => (v === 0 ? 'square' : `${v}px`)}
          onChange={(radius) => set({ radius })}
        />
        <Dial
          label="Wash"
          hint="The faint colour behind everything."
          value={current.wash}
          min={0}
          max={2}
          step={0.05}
          format={(v) => (v === 0 ? 'none' : `${Math.round(v * 100)}%`)}
          onChange={(wash) => set({ wash })}
        />
        <Dial
          label="Motion"
          hint="Zero is still. Your system's reduced-motion setting still wins."
          value={current.motion}
          min={0}
          max={2}
          step={0.1}
          format={(v) => (v === 0 ? 'still' : v === 1 ? 'normal' : `${v.toFixed(1)}×`)}
          onChange={(motion) => set({ motion })}
        />
        <Dial
          label="Size"
          hint="Scales the whole interface, text and spacing together."
          value={current.scale}
          min={0.85}
          max={1.25}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(scale) => set({ scale })}
        />
      </div>
    </section>
  )
}
