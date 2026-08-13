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
import { STRUCTURE_OPTIONS } from '@/features/projects/lib/structure-options'
import { emptyMatter, hasAnyMatter } from '@/features/reader/lib/matter'
import { BookThemePicker } from '@/features/theme/components/book-theme-picker'
import { TemplatePicker } from '@/features/templates/components/template-picker'
import { DEFAULT_TEMPLATE_ID } from '@/features/templates/lib/templates'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import type { ProjectFormInput } from '@/stores/project-store'
import type { Project } from '@/types'

interface ProjectFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: Project
  onSubmit: (input: ProjectFormInput) => Promise<void>
}

const EMPTY_FORM: ProjectFormInput = {
  title: '',
  author: '',
  genre: '',
  synopsis: '',
  targetWordCount: 80000,
  status: 'planning',
  pov: 'third-limited',
  tense: 'past',
  structureMode: 'scenes',
  themeId: null,
  templateId: DEFAULT_TEMPLATE_ID,
}

function formFromProject(project: Project): ProjectFormInput {
  return {
    title: project.title,
    author: project.author,
    genre: project.genre,
    synopsis: project.synopsis,
    targetWordCount: project.targetWordCount,
    status: project.status,
    pov: project.settings.pov,
    tense: project.settings.tense,
    structureMode: project.settings.structureMode ?? 'scenes',
    themeId: project.themeId ?? null,
    matter: { ...emptyMatter(), ...(project.matter ?? {}) },
  }
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  onSubmit,
}: ProjectFormDialogProps) {
  const titleId = useId()
  // Remounted via a `key` from the parent each time it opens, so these
  // initializers run fresh instead of needing an effect to resync on reopen.
  const [form, setForm] = useState<ProjectFormInput>(() =>
    project
      ? formFromProject(project)
      : { ...EMPTY_FORM, author: useAuthStore.getState().user?.authorName ?? '' },
  )
  const [titleError, setTitleError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Open from the start when the book already has matter, so editing it
  // never means hunting for a hidden section.
  const [matterOpen, setMatterOpen] = useState(() => hasAnyMatter(project?.matter))
  const matter = form.matter ?? emptyMatter()
  const setMatter = (changes: Partial<typeof matter>) =>
    setForm({ ...form, matter: { ...matter, ...changes } })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      setTitleError('Give your project a title.')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(form)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Bounded and scrolling in the middle. This form has grown a field at a
          time, and on a laptop the last one to arrive pushed "Create project"
          off the bottom of the screen with nothing to scroll — the dialog was
          sized by its content and its content had outgrown the viewport. */}
      <DialogContent className="flex max-w-lg flex-col">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{project ? 'Project settings' : 'New project'}</DialogTitle>
            <DialogDescription>
              {project
                ? 'Update the basics. You can change these again any time.'
                : 'Give your novel a home. You can fill in the rest later.'}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 grid min-h-0 flex-1 gap-4 overflow-y-auto pr-1">
            <div className="grid gap-1.5">
              <Label htmlFor={`${titleId}-title`}>Title</Label>
              <Input
                id={`${titleId}-title`}
                autoFocus
                value={form.title}
                onChange={(e) => {
                  setForm({ ...form, title: e.target.value })
                  if (titleError) setTitleError(null)
                }}
                placeholder="The name of your novel"
                aria-invalid={titleError ? true : undefined}
                aria-describedby={titleError ? `${titleId}-title-error` : undefined}
              />
              {titleError && (
                <p id={`${titleId}-title-error`} className="text-xs text-destructive">
                  {titleError}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor={`${titleId}-author`}>Author</Label>
                <Input
                  id={`${titleId}-author`}
                  value={form.author}
                  onChange={(e) => setForm({ ...form, author: e.target.value })}
                  placeholder="Your name or pen name"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${titleId}-genre`}>Genre</Label>
                <Input
                  id={`${titleId}-genre`}
                  value={form.genre}
                  onChange={(e) => setForm({ ...form, genre: e.target.value })}
                  placeholder="Fantasy, thriller, ..."
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={`${titleId}-synopsis`}>Synopsis</Label>
              <Textarea
                id={`${titleId}-synopsis`}
                value={form.synopsis}
                onChange={(e) => setForm({ ...form, synopsis: e.target.value })}
                placeholder="A sentence or two about what this book is about"
                rows={3}
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Manuscript structure</Label>
              <div className="grid grid-cols-2 gap-3">
                {STRUCTURE_OPTIONS.map((option) => {
                  const Icon = option.icon
                  const selected = form.structureMode === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setForm({ ...form, structureMode: option.value })}
                      aria-pressed={selected}
                      className={cn(
                        'flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors',
                        selected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border hover:bg-accent',
                      )}
                    >
                      <Icon
                        className={cn(
                          'size-4',
                          selected ? 'text-primary' : 'text-muted-foreground',
                        )}
                      />
                      <span className="text-sm font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </button>
                  )
                })}
              </div>
              {project && (
                <p className="text-xs text-muted-foreground/70">
                  This changes new chapters going forward — existing scenes are unaffected.
                </p>
              )}
            </div>

            {/* Only when starting a book. Applying a format to a manuscript
                that already has chapters would add a second prologue rather
                than reshape anything. */}
            {!project && (
              <TemplatePicker
                value={form.templateId ?? DEFAULT_TEMPLATE_ID}
                onChange={(templateId) => setForm({ ...form, templateId })}
                structureMode={form.structureMode}
                onStructureMode={(structureMode) => setForm((f) => ({ ...f, structureMode }))}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor={`${titleId}-target`}>Target word count</Label>
                <Input
                  id={`${titleId}-target`}
                  type="number"
                  min={0}
                  step={1000}
                  value={form.targetWordCount}
                  onChange={(e) =>
                    setForm({ ...form, targetWordCount: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value: ProjectFormInput['status']) =>
                    setForm({ ...form, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="drafting">Drafting</SelectItem>
                    <SelectItem value="revising">Revising</SelectItem>
                    <SelectItem value="complete">Complete</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Point of view</Label>
                <Select
                  value={form.pov}
                  onValueChange={(value: ProjectFormInput['pov']) =>
                    setForm({ ...form, pov: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first">First person</SelectItem>
                    <SelectItem value="second">Second person</SelectItem>
                    <SelectItem value="third-limited">Third limited</SelectItem>
                    <SelectItem value="third-omniscient">Third omniscient</SelectItem>
                    <SelectItem value="multiple">Multiple</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Tense</Label>
                <Select
                  value={form.tense}
                  onValueChange={(value: ProjectFormInput['tense']) =>
                    setForm({ ...form, tense: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="past">Past</SelectItem>
                    <SelectItem value="present">Present</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <BookThemePicker
              value={form.themeId}
              onChange={(themeId) => setForm({ ...form, themeId })}
            />

            {/* The book as an object: what stands before and after the story.
                Only for existing projects — a book needs to exist before it
                can be dedicated. */}
            {project && (
              <div className="grid gap-1.5">
                <button
                  type="button"
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm font-medium hover:bg-accent"
                  onClick={() => setMatterOpen((v) => !v)}
                  aria-expanded={matterOpen}
                >
                  Front &amp; back matter
                  <span className="text-xs font-normal text-muted-foreground">
                    {hasAnyMatter(matter) ? 'written' : 'none yet'} · {matterOpen ? 'hide' : 'edit'}
                  </span>
                </button>
                {matterOpen && (
                  <div className="grid gap-4 rounded-md border border-border p-3">
                    <p className="text-xs text-muted-foreground">
                      These become real pages in every export, the reader, and shared copies —
                      a dedication page, not text faked into chapter one. Leave a section empty
                      and it simply doesn't exist.
                    </p>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${titleId}-dedication`}>Dedication</Label>
                      <Textarea
                        id={`${titleId}-dedication`}
                        value={matter.dedication}
                        onChange={(e) => setMatter({ dedication: e.target.value })}
                        placeholder="For Ada."
                        rows={2}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${titleId}-epigraph`}>Epigraph</Label>
                      <Textarea
                        id={`${titleId}-epigraph`}
                        value={matter.epigraph}
                        onChange={(e) => setMatter({ epigraph: e.target.value })}
                        placeholder="A short quotation to open the book"
                        rows={2}
                      />
                      <Input
                        aria-label="Epigraph attribution"
                        value={matter.epigraphAttribution}
                        onChange={(e) => setMatter({ epigraphAttribution: e.target.value })}
                        placeholder="Who said it (shown as “— Name”)"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${titleId}-acknowledgments`}>Acknowledgments</Label>
                      <Textarea
                        id={`${titleId}-acknowledgments`}
                        value={matter.acknowledgments}
                        onChange={(e) => setMatter({ acknowledgments: e.target.value })}
                        placeholder="The people who kept this book alive"
                        rows={3}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${titleId}-about`}>About the author</Label>
                      <Textarea
                        id={`${titleId}-about`}
                        value={matter.aboutAuthor}
                        onChange={(e) => setMatter({ aboutAuthor: e.target.value })}
                        placeholder="A few sentences, third person, for the back of the book"
                        rows={3}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="mt-6 shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : project ? 'Save changes' : 'Create project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
