import { ArrowRight, Plus, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CodexEntry, CodexRelationship } from '@/types'

interface RelationshipListProps {
  relationships: CodexRelationship[]
  otherEntries: CodexEntry[]
  onAdd: (targetEntryId: string, label: string) => void
  onRemove: (id: string) => void
  onNavigate: (entryId: string) => void
}

export function RelationshipList({
  relationships,
  otherEntries,
  onAdd,
  onRemove,
  onNavigate,
}: RelationshipListProps) {
  const [targetId, setTargetId] = useState('')
  const [label, setLabel] = useState('')
  const entryById = new Map(otherEntries.map((e) => [e.id, e]))

  function handleAdd() {
    if (!targetId || !label.trim()) return
    onAdd(targetId, label.trim())
    setTargetId('')
    setLabel('')
  }

  return (
    <div className="space-y-2">
      {relationships.map((rel) => {
        const target = entryById.get(rel.targetEntryId)
        return (
          <div
            key={rel.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm"
          >
            <button
              type="button"
              onClick={() => onNavigate(rel.targetEntryId)}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:underline"
              disabled={!target}
            >
              <span className="shrink-0 text-muted-foreground">{rel.label}</span>
              <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{target?.name ?? 'Deleted entry'}</span>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              onClick={() => onRemove(rel.id)}
              aria-label="Remove relationship"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        )
      })}

      {otherEntries.length > 0 && (
        <div className="flex items-center gap-1.5">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="ally of, parent of…"
            className="w-32 shrink-0 text-sm"
          />
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Choose an entry" />
            </SelectTrigger>
            <SelectContent>
              {otherEntries.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={handleAdd}
            aria-label="Add relationship"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
