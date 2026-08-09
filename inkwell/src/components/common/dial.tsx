/**
 * One Dial: label · slider · formatted value, with an optional hint below.
 *
 * Four screens grew their own byte-similar copies of this control (both
 * theme editors, the page edge, the card design panel) — which is how a
 * fix to one becomes a bug report about the other three. The variations
 * were incidental (label column width, a missing hint slot), not
 * intentional design, so one component with defaults replaces all four.
 */
export function Dial({
  label,
  hint,
  value,
  min = 0,
  max = 1,
  step = 0.05,
  format = (v: number) => `${Math.round(v * 100)}%`,
  onChange,
}: {
  label: string
  hint?: string
  value: number
  min?: number
  max?: number
  step?: number
  format?: (value: number) => string
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-0.5">
      <label className="flex items-center gap-2 text-xs">
        <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1 flex-1 accent-primary pointer-coarse:h-11"
        />
        <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
          {format(value)}
        </span>
      </label>
      {hint && <p className="pl-[6.5rem] text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  )
}
