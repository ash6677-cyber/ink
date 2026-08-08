import { AlignCenter, AlignLeft, AlignRight, ChevronDown, ChevronUp, Pipette, Trash2 } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { EDITOR_FONTS } from '@/lib/editor/fonts'
import { cn } from '@/lib/utils'
import type { CoverTypographyLayer } from '@/types'

const KIND_LABEL: Record<CoverTypographyLayer['kind'], string> = {
  title: 'Title',
  author: 'Author',
  custom: 'Custom text',
}

const WEIGHT_OPTIONS = [400, 500, 600, 700, 800, 900]

interface TypographyLayerRowProps {
  layer: CoverTypographyLayer
  expanded: boolean
  onSelect: () => void
  onChange: (changes: Partial<CoverTypographyLayer>) => void
  onDelete: () => void
  /** Sample a colour from the cover art itself. Absent without an image. */
  onPickColor?: () => void
  picking?: boolean
}

export function TypographyLayerRow({
  layer,
  expanded,
  onSelect,
  onChange,
  onDelete,
  onPickColor,
  picking,
}: TypographyLayerRowProps) {
  return (
    <div className={cn('rounded-lg border', expanded ? 'border-primary/40 bg-accent/20' : 'border-border')}>
      <div className="flex items-center gap-2 p-2.5">
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {expanded ? (
            <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {KIND_LABEL[layer.kind]}
            </span>
            <span className="block truncate text-sm">{layer.text || 'Empty text layer'}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${KIND_LABEL[layer.kind]} layer`}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="grid gap-3 border-t border-border p-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Text</Label>
            <Textarea
              rows={2}
              value={layer.text}
              onChange={(e) => onChange({ text: e.target.value })}
              placeholder="Enter the text for this layer"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Font</Label>
              <Select value={layer.fontFamily} onValueChange={(v) => onChange({ fontFamily: v })}>
                <SelectTrigger aria-label="Layer font">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EDITOR_FONTS.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Weight</Label>
              <Select
                value={String(layer.fontWeight)}
                onValueChange={(v) => onChange({ fontWeight: Number(v) })}
              >
                <SelectTrigger aria-label="Layer font weight">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEIGHT_OPTIONS.map((w) => (
                    <SelectItem key={w} value={String(w)}>
                      {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Size — {layer.fontSize.toFixed(1)}%</Label>
            <input
              type="range"
              aria-label="Layer text size"
              min={2}
              max={20}
              step={0.5}
              value={layer.fontSize}
              onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
              className="accent-primary"
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Letter spacing — {layer.letterSpacing}%</Label>
            <input
              type="range"
              aria-label="Layer letter spacing"
              min={0}
              max={40}
              step={1}
              value={layer.letterSpacing}
              onChange={(e) => onChange({ letterSpacing: Number(e.target.value) })}
              className="accent-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Layer text color"
                  value={layer.color}
                  onChange={(e) => onChange({ color: e.target.value })}
                  className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                />
                <Input value={layer.color} onChange={(e) => onChange({ color: e.target.value })} />
                {onPickColor && (
                  <button
                    type="button"
                    onClick={onPickColor}
                    aria-label="Pick a colour from the cover image"
                    aria-pressed={picking}
                    title="Pick a colour from the cover image"
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-md border transition-colors',
                      picking
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Pipette className="size-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Align</Label>
              <div className="flex h-9 items-center gap-1 rounded-md border border-border p-1">
                {(
                  [
                    { value: 'left', icon: AlignLeft },
                    { value: 'center', icon: AlignCenter },
                    { value: 'right', icon: AlignRight },
                  ] as const
                ).map(({ value, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onChange({ align: value })}
                    aria-label={`Align ${value}`}
                    className={cn(
                      'flex flex-1 items-center justify-center rounded py-1',
                      layer.align === value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent',
                    )}
                  >
                    <Icon className="size-3.5" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Drop shadow</Label>
              <Switch aria-label="Toggle drop shadow" checked={layer.shadow} onCheckedChange={(v) => onChange({ shadow: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Outline</Label>
              <Switch
                aria-label="Toggle outline"
                checked={layer.stroke ?? false}
                onCheckedChange={(v) => onChange({ stroke: v })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
