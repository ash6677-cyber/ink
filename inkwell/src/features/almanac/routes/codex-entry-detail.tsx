import { ArrowLeft, Library, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { EmptyState } from '@/components/common/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { AppearancesList } from '@/features/almanac/components/appearances-list'
import { PresenceStrip } from '@/features/almanac/components/presence-strip'
import { AttributeList } from '@/features/almanac/components/attribute-list'
import { CodexBodyEditor } from '@/features/almanac/components/codex-body-editor'
import { ImageUploadField } from '@/features/almanac/components/image-upload-field'
import { RelationshipList } from '@/features/almanac/components/relationship-list'
import { ENTRY_TYPES, ENTRY_TYPE_LABEL } from '@/features/almanac/lib/entry-type'
import { useDebouncedCallback } from '@/lib/hooks/use-debounced-callback'
import { useCodexStore } from '@/stores/codex-store'
import type { AiContextInclusion, CodexEntryType, RichContent } from '@/types'
import { useDocumentTitle } from '@/lib/hooks/use-document-title'

const AI_CONTEXT_OPTIONS: { value: AiContextInclusion; label: string; hint: string }[] = [
  { value: 'always', label: 'Always include', hint: 'Sent on every AI request for this project' },
  {
    value: 'when-relevant',
    label: 'Include when relevant',
    hint: 'Sent when it matches the scene',
  },
  { value: 'never', label: 'Never include', hint: 'Kept out of AI context entirely' },
]

export function CodexEntryDetail() {
  const { entryId } = useParams<{ entryId: string }>()
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('project')
  const navigate = useNavigate()
  const { toast } = useToast()

  const {
    entries,
    status,
    loadProject,
    updateEntry,
    deleteEntry,
    addAttribute,
    updateAttribute,
    removeAttribute,
    addRelationship,
    removeRelationship,
    setAiContext,
  } = useCodexStore()

  useEffect(() => {
    if (projectId) loadProject(projectId)
  }, [projectId, loadProject])

  const entry = useMemo(() => entries.find((e) => e.id === entryId), [entries, entryId])
  useDocumentTitle(entry?.name, 'Almanac')

  const [nameDraft, setNameDraft] = useState(entry?.name ?? '')
  const [aliasesDraft, setAliasesDraft] = useState(entry?.aliases.join(', ') ?? '')
  const [summaryDraft, setSummaryDraft] = useState(entry?.summary ?? '')
  const [tagsDraft, setTagsDraft] = useState(entry?.tags.join(', ') ?? '')
  // Starts undefined (not `entryId`) so that when this entry's data arrives asynchronously
  // after mount — e.g. a direct page load/refresh, where the store is still empty at mount
  // time — the drafts still get hydrated even though `entryId` itself never changes.
  const [renderedEntryId, setRenderedEntryId] = useState<string | undefined>(undefined)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (entry && entryId !== renderedEntryId) {
    setRenderedEntryId(entryId)
    setNameDraft(entry.name)
    setAliasesDraft(entry.aliases.join(', '))
    setSummaryDraft(entry.summary)
    setTagsDraft(entry.tags.join(', '))
  }

  const debouncedSaveBody = useDebouncedCallback(
    (id: string, input: { content: RichContent; plainText: string }) => {
      updateEntry(id, { body: input.content, plainText: input.plainText })
    },
    800,
  )

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={Library}
          title="No project selected"
          description="Open a project from the Projects page to view its Almanac."
          action={
            <Button asChild>
              <Link to="/projects">Go to Projects</Link>
            </Button>
          }
        />
      </div>
    )
  }

  if (status === 'loading' && entries.length === 0) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    )
  }

  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={Library}
          title="Entry not found"
          description="This entry may have been deleted."
          action={
            <Button asChild>
              <Link to={`/almanac?project=${projectId}`}>Back to Almanac</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const otherEntries = entries.filter((e) => e.id !== entry.id)

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link to={`/almanac?project=${projectId}`}>
            <ArrowLeft className="size-4" /> Almanac
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDeleteOpen(true)}
          aria-label="Delete entry"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-5 py-8 sm:px-8 sm:py-10">
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() =>
                nameDraft.trim() &&
                nameDraft !== entry.name &&
                updateEntry(entry.id, { name: nameDraft.trim() })
              }
              placeholder="Name"
              className="h-auto border-none px-0 font-serif text-3xl font-semibold shadow-none focus-visible:ring-0"
            />
            <Input
              value={aliasesDraft}
              onChange={(e) => setAliasesDraft(e.target.value)}
              onBlur={() =>
                updateEntry(entry.id, {
                  aliases: aliasesDraft
                    .split(',')
                    .map((a) => a.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Aliases (comma-separated)"
              className="mt-1 h-auto border-none px-0 text-sm text-muted-foreground shadow-none focus-visible:ring-0"
            />

            <Textarea
              value={summaryDraft}
              onChange={(e) => setSummaryDraft(e.target.value)}
              onBlur={() =>
                summaryDraft !== entry.summary && updateEntry(entry.id, { summary: summaryDraft })
              }
              placeholder="A sentence or two summarising this entry…"
              rows={2}
              className="mt-4 resize-none border-none px-0 shadow-none focus-visible:ring-0"
            />

            <div className="mt-6 border-t border-border pt-6">
              <CodexBodyEditor
                entryId={entry.id}
                content={entry.body}
                onChange={(input) => debouncedSaveBody(entry.id, input)}
              />
            </div>
          </div>
        </div>

        <aside className="w-full shrink-0 space-y-6 overflow-y-auto border-t border-border p-5 lg:w-80 lg:border-l lg:border-t-0">
          <ImageUploadField
            imageId={entry.imageId}
            onChange={(imageId) => updateEntry(entry.id, { imageId })}
          />

          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select
              value={entry.type}
              onValueChange={(v: CodexEntryType) => updateEntry(entry.id, { type: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTRY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {ENTRY_TYPE_LABEL[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="entry-tags">Tags</Label>
            <Input
              id="entry-tags"
              value={tagsDraft}
              onChange={(e) => setTagsDraft(e.target.value)}
              onBlur={() =>
                updateEntry(entry.id, {
                  tags: tagsDraft
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Comma-separated"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Attributes</Label>
            <AttributeList
              attributes={entry.attributes}
              onAdd={(key, value) => addAttribute(entry.id, key, value)}
              onUpdate={(id, key, value) => updateAttribute(entry.id, id, key, value)}
              onRemove={(id) => removeAttribute(entry.id, id)}
            />
          </div>

          {/* Its own section. Relationships are what the writer said about
              this entry; appearances are what the manuscript says about it.
              Putting one inside the other read as though the scenes listed
              were somehow relationships. */}
          <AppearancesList entry={entry} projectId={projectId} />

          <PresenceStrip entry={entry} projectId={projectId} />

          <div className="grid gap-1.5">
            <Label>Relationships</Label>
            <RelationshipList
              relationships={entry.relationships}
              otherEntries={otherEntries}
              onAdd={(targetId, label) => addRelationship(entry.id, targetId, label)}
              onRemove={(id) => removeRelationship(entry.id, id)}
              onNavigate={(id) => navigate(`/almanac/${id}?project=${projectId}`)}
            />
            {/* The other direction, computed rather than stored: a link is
                one fact ("Edda — mother of → Maren"), and asking writers to
                record it twice guarantees the two copies drift. */}
            {(() => {
              const inbound = otherEntries.flatMap((other) =>
                other.relationships
                  .filter((rel) => rel.targetEntryId === entry.id)
                  .map((rel) => ({ other, label: rel.label })),
              )
              if (inbound.length === 0) return null
              return (
                <div className="mt-1 space-y-1">
                  <p className="text-xs text-muted-foreground">Pointed here by</p>
                  <div className="flex flex-wrap gap-1.5">
                    {inbound.map(({ other, label }) => (
                      <button
                        key={`${other.id}-${label}`}
                        type="button"
                        onClick={() => navigate(`/almanac/${other.id}?project=${projectId}`)}
                        className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-accent pointer-coarse:min-h-9"
                      >
                        <span className="font-medium">{other.name}</span>
                        <span className="text-muted-foreground"> · {label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>

          <div className="grid gap-1.5">
            <Label>AI context</Label>
            <Select
              value={entry.aiContext}
              onValueChange={(v: AiContextInclusion) =>
                setAiContext(entry.id, v, entry.aiContextTokenBudget)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_CONTEXT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {AI_CONTEXT_OPTIONS.find((o) => o.value === entry.aiContext)?.hint}
            </p>
          </div>
        </aside>
      </div>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete "${entry.name}"?`}
        description="This permanently deletes the entry from your Almanac. This can't be undone."
        onConfirm={async () => {
          await deleteEntry(entry.id)
          toast({ title: `"${entry.name}" deleted` })
          navigate(`/almanac?project=${projectId}`)
        }}
      />
    </div>
  )
}
