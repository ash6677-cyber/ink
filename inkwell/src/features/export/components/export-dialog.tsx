import { Check, Download, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { FORMAT_META, type ExportFormat } from '@/features/export/lib/export-formats'
import { saveExport } from '@/features/export/lib/save-file'
import { compileBook, type BookChapter } from '@/features/reader/lib/compile-book'
import { chapterRepo, sceneRepo } from '@/lib/db/repositories'
import { cn } from '@/lib/utils'
import { usePreferencesStore } from '@/stores/preferences-store'
import type { Project } from '@/types'

const FORMATS: ExportFormat[] = ['docx', 'epub', 'markdown', 'html', 'text']

export function ExportDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // Opens on whatever was chosen last time. Someone who exports to EPUB
  // exports to EPUB every week, and re-answering a settled question is the
  // kind of chore that only shows up as a chore the tenth time.
  const lastFormat = usePreferencesStore((s) => s.lastExportFormat)
  const rememberExportFormat = usePreferencesStore((s) => s.rememberExportFormat)
  const [format, setFormat] = useState<ExportFormat>(() =>
    FORMATS.includes(lastFormat as ExportFormat) ? (lastFormat as ExportFormat) : 'docx',
  )
  const [loaded, setLoaded] = useState<{ projectId: string; book: BookChapter[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  // Tagged with the project it came from and compared during render, so
  // reopening the dialog for a different project can never briefly show the
  // previous one's chapter count — and no state is cleared inside the effect.
  const book = loaded && loaded.projectId === project?.id ? loaded.book : null

  // Read the manuscript straight from the repositories rather than the
  // editor store: export shouldn't require the project to be open, and the
  // store only ever holds one project at a time.
  useEffect(() => {
    if (!open || !project) return
    let cancelled = false
    Promise.all([chapterRepo.list(), sceneRepo.list()]).then(([chapters, scenes]) => {
      if (cancelled) return
      setLoaded({
        projectId: project.id,
        book: compileBook(
          chapters.filter((c) => c.projectId === project.id),
          scenes.filter((s) => s.projectId === project.id),
        ),
      })
    })
    return () => {
      cancelled = true
    }
  }, [open, project])

  const wordCount = book?.reduce((sum, chapter) => sum + chapter.wordCount, 0) ?? 0
  const chapterCount =
    book?.filter((chapter) =>
      chapter.scenes.some((scene) => scene.plainText.trim().length > 0 || scene.content),
    ).length ?? 0

  async function handleExport() {
    if (!project || !book) return
    setBusy(true)
    try {
      // The DOCX/EPUB machinery is over a megabyte of source; it loads the
      // first time someone actually exports, never at boot.
      const { buildExport } = await import('@/features/export/lib/exporters')
      const result = await buildExport(format, project, book)
      const outcome = await saveExport(result)
      if (outcome === 'saved') {
        // Remembered only on success: a format that failed or was cancelled
        // has not earned being the default next time.
        rememberExportFormat(format)
        toast({ title: `Exported as ${FORMAT_META[format].label}`, description: result.filename })
        onOpenChange(false)
      }
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export “{project?.title}”</DialogTitle>
          <DialogDescription>
            {book === null
              ? 'Reading your manuscript…'
              : chapterCount === 0
                ? 'This project has no written chapters yet.'
                : `${chapterCount} chapter${chapterCount === 1 ? '' : 's'} · ${wordCount.toLocaleString()} words`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          {FORMATS.map((value) => {
            const meta = FORMAT_META[value]
            const selected = format === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setFormat(value)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left transition-[border-color,box-shadow]',
                  selected ? 'border-primary ring-1 ring-primary' : 'hover:border-foreground/20',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{meta.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
                </div>
                {selected && <Check className="mt-0.5 size-4 shrink-0 text-primary" />}
              </button>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={busy || book === null || chapterCount === 0}
            className="gap-1.5"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {busy ? 'Exporting…' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
