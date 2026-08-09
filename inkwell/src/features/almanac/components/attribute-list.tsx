import { Plus, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CodexAttribute } from '@/types'

interface AttributeListProps {
  attributes: CodexAttribute[]
  onAdd: (key: string, value: string) => void
  onUpdate: (id: string, key: string, value: string) => void
  onRemove: (id: string) => void
}

export function AttributeList({ attributes, onAdd, onUpdate, onRemove }: AttributeListProps) {
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  function handleAdd() {
    if (!newKey.trim()) return
    onAdd(newKey.trim(), newValue.trim())
    setNewKey('')
    setNewValue('')
  }

  return (
    <div className="space-y-2">
      {attributes.map((attr) => (
        <div key={attr.id} className="flex items-center gap-1.5">
          <Input
            defaultValue={attr.key}
            onBlur={(e) => onUpdate(attr.id, e.target.value, attr.value)}
            placeholder="Field"
            className="w-28 shrink-0 text-sm"
          />
          <Input
            defaultValue={attr.value}
            onBlur={(e) => onUpdate(attr.id, attr.key, e.target.value)}
            placeholder="Value"
            className="flex-1 text-sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => onRemove(attr.id)}
            aria-label={`Remove ${attr.key}`}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-1.5">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
          placeholder="Field"
          className="w-28 shrink-0 text-sm"
        />
        <Input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
          placeholder="Value"
          className="flex-1 text-sm"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={handleAdd}
          aria-label="Add attribute"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
