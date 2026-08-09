import { Label } from '@/components/ui/label'
import { Dial } from '@/components/common/dial'
import { Switch } from '@/components/ui/switch'
import { ColorRow } from '@/features/theme/components/color-row'
import { formatOklch, parseOklch } from '@/features/theme/lib/oklch'
import {
  DEFAULT_PAGE_EDGE,
  edgeStyle,
  EDGE_SOURCE_LABEL,
  NO_PAGE_EDGE,
} from '@/features/theme/lib/page-edge'
import { cn } from '@/lib/utils'
import type { PageEdge, PageEdgeSource } from '@/types'

interface PageEdgeEditorProps {
  edge: PageEdge | undefined
  onChange: (edge: PageEdge) => void
}

const SOURCES: PageEdgeSource[] = ['primary', 'brand-2', 'accent', 'border', 'custom']


/**
 * The edge around the page, and a piece of page to see it on.
 *
 * The preview is here rather than left to the live app because this dialog
 * covers the editor: everything else in a theme shows through to the screen
 * behind it, and this is the one setting whose surface you cannot see while
 * you are changing it.
 */
export function PageEdgeEditor({ edge, onChange }: PageEdgeEditorProps) {
  const current = edge ?? NO_PAGE_EDGE
  const set = (changes: Partial<PageEdge>) => onChange({ ...current, ...changes })
  const custom = parseOklch(current.color)

  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label htmlFor="page-edge-on" className="text-sm font-semibold">
            Page edges
          </Label>
          <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
            A rule and a glow around the page you write on and the book you read. Hidden in
            focus mode — the whole point of focus mode is that this sort of thing goes away.
          </p>
        </div>
        <Switch
          id="page-edge-on"
          checked={current.enabled}
          // Switching on for the first time gives the default look, glow and
          // all. Spreading the off-state over the default instead gave a bare
          // rule and no glow — a switch that appears to do almost nothing.
          // Switching a previously-tuned edge back on restores their settings.
          onCheckedChange={(on) =>
            onChange(
              on
                ? edge
                  ? { ...edge, enabled: true }
                  : DEFAULT_PAGE_EDGE
                : { ...current, enabled: false },
            )
          }
        />
      </div>

      {current.enabled && (
        <>
          <div
            className="flex h-24 items-center justify-center rounded-lg bg-background p-3"
            aria-hidden="true"
          >
            <div
              data-testid="page-edge-preview"
              className="page-edge h-full w-2/3 bg-card"
              style={edgeStyle(current) as React.CSSProperties}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Colour</Label>
            <div className="flex flex-wrap gap-1.5">
              {SOURCES.map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => set({ source })}
                  aria-pressed={current.source === source}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    current.source === source
                      ? 'border-primary bg-primary/10 font-medium text-foreground'
                      : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {EDGE_SOURCE_LABEL[source]}
                </button>
              ))}
            </div>
            {current.source !== 'custom' && (
              <p className="text-xs text-muted-foreground">
                Follows the palette, so the edge is right in light and dark without being set
                twice.
              </p>
            )}
          </div>

          {current.source === 'custom' && custom && (
            <ul className="space-y-1.5">
              <ColorRow
                spec={{ token: 'primary', label: 'Edge colour', hint: 'Yours alone' }}
                color={custom}
                against={null}
                overridden
                onChange={(color) => set({ color: formatOklch(color) })}
                onReset={() => set({ source: 'primary' })}
              />
            </ul>
          )}

          <div className="space-y-1.5">
            <Dial
              label="Rule"
              value={current.width}
              min={0}
              max={8}
              step={1}
              format={(v) => `${v}px`}
              onChange={(width) => set({ width })}
            />
            <Dial
              label="Rule strength"
              value={current.borderOpacity}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(borderOpacity) => set({ borderOpacity })}
            />
            <Dial
              label="Page corners"
              value={current.radius}
              min={0}
              max={40}
              step={1}
              format={(v) => `${v}px`}
              onChange={(radius) => set({ radius })}
            />
            <Dial
              label="Glow"
              value={current.glow}
              min={0}
              max={90}
              step={1}
              format={(v) => `${v}px`}
              onChange={(glow) => set({ glow })}
            />
            <Dial
              label="Glow strength"
              value={current.glowOpacity}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(glowOpacity) => set({ glowOpacity })}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            A rule with no glow is a sharp printed edge. A glow with no rule is light with
            nothing drawing it.
          </p>
        </>
      )}
    </section>
  )
}
