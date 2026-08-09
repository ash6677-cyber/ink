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
import { Textarea } from '@/components/ui/textarea'
import type { CodexEntryInput } from '@/stores/codex-store'
import type { CodexEntryType } from '@/types'

const TYPE_OPTIONS: { value: CodexEntryType; label: string }[] = [
  { value: 'character', label: 'Character' },
  { value: 'location', label: 'Location' },
  { value: 'item', label: 'Item' },
  { value: 'faction', label: 'Faction' },
  { value: 'lore', label: 'Lore' },
  { value: 'concept', label: 'Concept' },
  { value: 'other', label: 'Other' },
]

interface EntryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultType?: CodexEntryType
  onSubmit: (input: CodexEntryInput) => Promise<void>
}

const EMPTY_FORM = { name: '', aliases: '', summary: '', tags: '' }

export function EntryFormDialog({
  open,
  onOpenChange,
  defaultType,
  onSubmit,
}: EntryFormDialogProps) {
  const titleId = useId()
  const [type, setType] = useState<CodexEntryType>(defaultType ?? 'character')
  const [form, setForm] = useState(EMPTY_FORM)
  const [nameError, setNameError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setNameError('Give this entry a name.')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        type,
        name: form.name.trim(),
        aliases: form.aliases
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
        summary: form.summary,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      })
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
            <DialogTitle>New Almanac entry</DialogTitle>
            <DialogDescription>
              Start with the basics — you can add attributes, relationships, and an image after.
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
                placeholder="Character, place, or thing's name"
                aria-invalid={nameError ? true : undefined}
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>

            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v: CodexEntryType) => setType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={`${titleId}-aliases`}>Aliases</Label>
              <Input
                id={`${titleId}-aliases`}
                value={form.aliases}
                onChange={(e) => setForm({ ...form, aliases: e.target.value })}
                placeholder="Comma-separated: nicknames, titles, other names"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={`${titleId}-summary`}>Summary</Label>
              <Textarea
                id={`${titleId}-summary`}
                rows={3}
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                placeholder="A sentence or two — shown on the card and in hover previews"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={`${titleId}-tags`}>Tags</Label>
              <Input
                id={`${titleId}-tags`}
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="Comma-separated"
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create entry'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
