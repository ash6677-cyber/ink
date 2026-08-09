import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import type { PresetInput } from '@/stores/ai-store'
import type { AiPreset, AiProviderConfig } from '@/types'

interface PresetFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preset?: AiPreset
  providers: AiProviderConfig[]
  onSubmit: (input: PresetInput) => Promise<void>
}

function formFromPreset(preset: AiPreset | undefined, providers: AiProviderConfig[]): PresetInput {
  return {
    name: preset?.name ?? '',
    providerId: preset?.providerId ?? providers[0]?.id ?? null,
    model: preset?.model ?? providers[0]?.defaultModel ?? '',
    temperature: preset?.temperature ?? 0.8,
    topP: preset?.topP ?? 1,
    systemPrompt: preset?.systemPrompt ?? '',
    proseInstructions: preset?.proseInstructions ?? '',
    contextRules: preset?.contextRules ?? {
      precedingParagraphs: 6,
      includeCodex: true,
      codexTokenBudget: 1200,
      includeLorebook: false,
      lorebookTokenBudget: 800,
    },
  }
}

export function PresetFormDialog({ open, onOpenChange, preset, providers, onSubmit }: PresetFormDialogProps) {
  const titleId = useId()
  const [form, setForm] = useState<PresetInput>(() => formFromPreset(preset, providers))
  const [nameError, setNameError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setNameError('Give this preset a name.')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({ ...form, name: form.name.trim() })
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{preset ? 'Edit preset' : 'New AI preset'}</DialogTitle>
            <DialogDescription>
              Presets bundle a provider, model, and instructions you can pick per action.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor={`${titleId}-name`}>Name</Label>
              <Input
                id={`${titleId}-name`}
                autoFocus
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value })
                  if (nameError) setNameError(null)
                }}
                placeholder="Faithful prose"
                aria-invalid={nameError ? true : undefined}
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Provider</Label>
                {providers.length === 0 ? (
                  <p className="flex h-9 items-center text-xs text-muted-foreground">Add a provider first</p>
                ) : (
                  <Select
                    value={form.providerId ?? ''}
                    onValueChange={(v) => setForm({ ...form, providerId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${titleId}-model`}>Model</Label>
                <Input
                  id={`${titleId}-model`}
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="gpt-4o"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor={`${titleId}-temp`}>Temperature</Label>
                <Input
                  id={`${titleId}-temp`}
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={form.temperature}
                  onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${titleId}-topp`}>Top P</Label>
                <Input
                  id={`${titleId}-topp`}
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={form.topP}
                  onChange={(e) => setForm({ ...form, topP: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={`${titleId}-system`}>System prompt</Label>
              <Textarea
                id={`${titleId}-system`}
                rows={2}
                value={form.systemPrompt}
                onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                placeholder="Leave blank to use the default co-writer prompt"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={`${titleId}-instructions`}>Prose instructions</Label>
              <Textarea
                id={`${titleId}-instructions`}
                rows={2}
                value={form.proseInstructions}
                onChange={(e) => setForm({ ...form, proseInstructions: e.target.value })}
                placeholder="Tone, style, or constraints to apply every time"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor={`${titleId}-paragraphs`}>Preceding paragraphs</Label>
                <Input
                  id={`${titleId}-paragraphs`}
                  type="number"
                  min={0}
                  value={form.contextRules.precedingParagraphs}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contextRules: { ...form.contextRules, precedingParagraphs: Number(e.target.value) },
                    })
                  }
                />
              </div>
              <div />
            </div>

            <div className="grid gap-3 rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label htmlFor={`${titleId}-include-codex`}>Include Almanac context</Label>
                  <p className="text-xs text-muted-foreground">
                    Pull in worldbuilding entries mentioned nearby.
                  </p>
                </div>
                <Switch
                  id={`${titleId}-include-codex`}
                  checked={form.contextRules.includeCodex}
                  onCheckedChange={(v) =>
                    setForm({ ...form, contextRules: { ...form.contextRules, includeCodex: v } })
                  }
                />
              </div>
              {form.contextRules.includeCodex && (
                <div className="grid gap-1.5 pl-0.5">
                  <Label htmlFor={`${titleId}-codex-budget`} className="text-xs">
                    Almanac token budget
                  </Label>
                  <Input
                    id={`${titleId}-codex-budget`}
                    type="number"
                    min={0}
                    step={100}
                    value={form.contextRules.codexTokenBudget}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        contextRules: { ...form.contextRules, codexTokenBudget: Number(e.target.value) },
                      })
                    }
                  />
                </div>
              )}
            </div>

            <div className="grid gap-3 rounded-md border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label htmlFor={`${titleId}-include-lorebook`}>Include lorebook context</Label>
                  <p className="text-xs text-muted-foreground">
                    Inject matching lorebook entries into character chats.
                  </p>
                </div>
                <Switch
                  id={`${titleId}-include-lorebook`}
                  checked={form.contextRules.includeLorebook}
                  onCheckedChange={(v) =>
                    setForm({ ...form, contextRules: { ...form.contextRules, includeLorebook: v } })
                  }
                />
              </div>
              {form.contextRules.includeLorebook && (
                <div className="grid gap-1.5 pl-0.5">
                  <Label htmlFor={`${titleId}-lorebook-budget`} className="text-xs">
                    Lorebook token budget
                  </Label>
                  <Input
                    id={`${titleId}-lorebook-budget`}
                    type="number"
                    min={0}
                    step={100}
                    value={form.contextRules.lorebookTokenBudget}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        contextRules: { ...form.contextRules, lorebookTokenBudget: Number(e.target.value) },
                      })
                    }
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : preset ? 'Save changes' : 'Create preset'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
