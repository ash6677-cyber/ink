import { FileText, Loader2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
import { useToast } from '@/components/ui/use-toast'
import { commitManuscript } from '@/features/import/lib/commit-import'
import {
  METHOD_NOTE,
  detectStructure,
  normaliseTitles,
  type DetectedManuscript,
} from '@/features/import/lib/parse-manuscript'
import { ACCEPTED_EXTENSIONS, kindForFile, readBlocks } from '@/features/import/lib/read-document'
import { formatWordCount } from '@/lib/format'
import { useProjectStore } from '@/stores/project-store'

interface ImportManuscriptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Bringing in a book that already exists.
 *
 * The structure is shown before anything is written, because a wrong guess
 * about where the chapters are is not a small mistake once it has become
 * sixty records — and the writer is the only one who can tell at a glance
 * whether the guess was right.
 */
export function ImportManuscriptDialog({ open, onOpenChange }: ImportManuscriptDialogProps) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const fileRef = useRef<HTMLInputElement>(null)

  const [reading, setReading] = useState(false)
  const [manuscript, setManuscript] = useState<DetectedManuscript | null>(null)
  const [fileName, setFileName] = useState('')
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [committing, setCommitting] = useState(false)

  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setManuscript(null)
      setFileName('')
      setTitle('')
      setAuthor('')
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    const kind = kindForFile(file.name)
    if (!kind) {
      toast({
        title: 'That file type is not supported',
        description:
          'Word documents (.docx), Markdown (.md), plain text (.txt), or a zipped Scrivener project (.zip).',
        variant: 'destructive',
      })
      return
    }
    setReading(true)
    try {
      let detected: DetectedManuscript
      if (kind === 'scrivener') {
        // The binder already says what the structure is; no guessing.
        const { readScrivenerArchive } = await import('@/features/import/lib/scrivener')
        detected = await readScrivenerArchive(file)
      } else {
        detected = detectStructure(await readBlocks(file))
      }
      if (detected.chapters.length === 0) {
        toast({ title: 'There was no text in that file', variant: 'destructive' })
        return
      }
      setManuscript({ ...detected, chapters: normaliseTitles(detected.chapters) })
      setFileName(file.name)
      // The document's own title page beats the filename; the filename beats
      // an empty box, because correcting one field is a smaller ask than
      // typing one.
      setTitle(
        detected.title.trim() ||
          file.name
            .replace(/\.[^.]+$/, '')
            .replace(/[_-]+/g, ' ')
            .trim(),
      )
    } catch (error) {
      toast({
        title: 'Could not read that file',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setReading(false)
    }
  }

  async function commit() {
    if (!manuscript) return
    setCommitting(true)
    try {
      const result = await commitManuscript(manuscript, { projectId: null, title, author })
      await fetchProjects()
      onOpenChange(false)
      toast({
        title: `${result.chapters} chapters, ${formatWordCount(result.words)} words imported`,
      })
      navigate(`/editor?project=${result.projectId}`)
    } catch {
      toast({ title: 'Could not create the book', variant: 'destructive' })
    } finally {
      setCommitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a manuscript</DialogTitle>
          <DialogDescription>
            {manuscript
              ? 'Here is the structure that was found. Nothing has been created yet.'
              : 'A Word document, Markdown, plain text, or a zipped Scrivener project.'}
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />

        {!manuscript ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              void handleFile(e.dataTransfer.files?.[0])
            }}
            className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-6 text-center transition-colors hover:border-primary/50 hover:bg-accent/30"
          >
            {reading ? (
              <Loader2 className="size-6 animate-spin text-primary" />
            ) : (
              <Upload className="size-6 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">
              {reading ? 'Reading…' : 'Choose a file, or drop one here'}
            </span>
            <span className="text-xs text-muted-foreground">
              .docx · .md · .txt · Scrivener (.scriv, zipped)
            </span>
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="size-3.5 shrink-0" />
              <span className="truncate">{fileName}</span>
              <button
                type="button"
                className="shrink-0 text-primary underline-offset-2 hover:underline"
                onClick={() => setManuscript(null)}
              >
                Choose another
              </button>
            </div>

            <p className="rounded-md border border-border bg-accent/30 p-2.5 text-xs">
              <strong>
                {manuscript.chapters.length} chapters ·{' '}
                {manuscript.chapters.reduce((n, c) => n + c.scenes.length, 0)} scenes ·{' '}
                {formatWordCount(manuscript.wordCount)} words
              </strong>
              <br />
              {METHOD_NOTE[manuscript.method]}
            </p>

            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {manuscript.chapters.map((chapter, index) => (
                <li
                  key={`${chapter.title}-${index}`}
                  className="rounded-md border border-border px-3 py-2 text-xs"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{chapter.title}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatWordCount(chapter.wordCount)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-muted-foreground">
                    {chapter.scenes.length} {chapter.scenes.length === 1 ? 'scene' : 'scenes'} ·{' '}
                    {chapter.scenes[0]?.paragraphs[0]?.slice(0, 70)}…
                  </p>
                </li>
              ))}
            </ul>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="import-title">Book title</Label>
                <Input
                  id="import-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="The name of your novel"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="import-author">Author</Label>
                <Input
                  id="import-author"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Your name or pen name"
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {manuscript && (
            <Button onClick={commit} disabled={committing} className="gap-1.5">
              {committing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Create the book
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
