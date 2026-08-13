import { BookOpenCheck, Loader2, Play, RotateCcw, Square } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import {
  buildChapterMessages,
  buildLetterMessages,
  clearReadThroughState,
  emptyReadThroughState,
  estimateCost,
  estimateReadThrough,
  loadReadThroughState,
  parseChapterReply,
  saveReadThroughState,
  type ReadThroughChapter,
  type ReadThroughState,
} from '@/features/editor/lib/read-through'
import { presetForFeature } from '@/lib/ai/feature-preset'
import { resolveProvider } from '@/lib/ai/resolve-provider'
import { useAiGeneration } from '@/lib/ai/use-ai-generation'
import { useAiStore } from '@/stores/ai-store'
import { useEditorStore } from '@/stores/editor-store'
import { usePreferencesStore } from '@/stores/preferences-store'

/**
 * The whole book, read in order by a model on the writer's own key, into
 * an editorial letter. Honest throughout: the token bill is on the table
 * before anything runs, progress streams chapter by chapter, an
 * interrupted run resumes where it stopped, and every claim in the
 * letter names its chapter — rendered here as a door into it.
 */
export function ReadThroughPanel({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
}) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const chapters = useEditorStore((s) => s.chapters)
  const scenes = useEditorStore((s) => s.scenes)

  const book: ReadThroughChapter[] = useMemo(() => {
    return [...chapters]
      .sort((a, b) => a.order - b.order)
      .map((chapter) => ({
        title: chapter.title,
        text: scenes
          .filter((s) => s.chapterId === chapter.id)
          .sort((a, b) => a.order - b.order)
          .map((s) => s.plainText)
          .join('\n\n')
          .trim(),
      }))
      .filter((chapter) => chapter.text.length > 0)
  }, [chapters, scenes])

  // The first scene of each readable chapter, so "(Chapter N)" is a door.
  const chapterDoors = useMemo(() => {
    const ordered = [...chapters].sort((a, b) => a.order - b.order)
    return ordered
      .map((chapter) => scenes.filter((s) => s.chapterId === chapter.id).sort((a, b) => a.order - b.order)[0]?.id)
      .filter(Boolean) as string[]
  }, [chapters, scenes])

  const estimate = useMemo(() => estimateReadThrough(book), [book])
  const [rate, setRate] = useState('')
  const cost = rate.trim() ? estimateCost(estimate, Number(rate) || 0) : null

  const presets = useAiStore((s) => s.presets)
  const providers = useAiStore((s) => s.providers)
  const featurePresets = usePreferencesStore((s) => s.featurePresets)
  const featureProviders = usePreferencesStore((s) => s.featureProviders)
  const preset = presetForFeature(presets, 'readThrough', featurePresets)
  const provider = resolveProvider(preset, providers, featureProviders.readThrough)?.provider
  const { generate } = useAiGeneration()

  const [state, setState] = useState<ReadThroughState | null>(() => null)
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState('')
  const stopRef = useRef(false)

  // Load any resumable run when the dialog opens (render-time key pattern).
  const [loadedFor, setLoadedFor] = useState('')
  const openKey = open ? `${projectId}:${book.length}` : ''
  if (loadedFor !== openKey) {
    setLoadedFor(openKey)
    if (open) setState(loadReadThroughState(projectId, book.length))
  }

  async function run() {
    if (!preset || !provider) {
      toast({ title: 'Add an AI key in Settings first', variant: 'destructive' })
      return
    }
    setRunning(true)
    stopRef.current = false
    const model = preset.model || provider.defaultModel || ''
    let working = state ?? emptyReadThroughState(book.length)

    try {
      for (let i = working.nextChapter; i < book.length; i++) {
        if (stopRef.current) return
        setPhase(`Reading chapter ${i + 1} of ${book.length}…`)
        const raw = await generate({
          provider,
          model,
          messages: buildChapterMessages(working.memory, book[i], i, book.length),
          temperature: 0.2,
          topP: 1,
        })
        if (!raw.trim()) return // failure surfaced by the hook; state keeps
        const { note, memory } = parseChapterReply(raw)
        working = {
          ...working,
          nextChapter: i + 1,
          memory: memory || working.memory,
          notes: [...working.notes, { chapterIndex: i, chapterTitle: book[i].title, note }],
        }
        // Persisted after EVERY chapter: an interruption costs at most one.
        saveReadThroughState(projectId, working)
        setState(working)
      }

      if (stopRef.current || working.letter) return
      setPhase('Writing the editorial letter…')
      const letter = await generate({
        provider,
        model,
        messages: buildLetterMessages(working.notes, working.memory),
        temperature: 0.4,
        topP: 1,
      })
      if (!letter.trim()) return
      working = { ...working, letter: letter.trim() }
      saveReadThroughState(projectId, working)
      setState(working)
    } finally {
      setRunning(false)
      setPhase('')
    }
  }

  function openChapter(chapterNumber: number) {
    const sceneId = chapterDoors[chapterNumber - 1]
    if (sceneId) navigate(`/editor?project=${projectId}&scene=${sceneId}`)
  }

  /** The letter with every "(Chapter N)" turned into a door. */
  function renderLetter(letter: string) {
    const parts = letter.split(/(\(Chapter \d+\))/g)
    return parts.map((part, index) => {
      const match = /^\(Chapter (\d+)\)$/.exec(part)
      if (!match) return <span key={index}>{part}</span>
      return (
        <button
          key={index}
          type="button"
          className="font-medium text-primary underline-offset-2 hover:underline"
          onClick={() => openChapter(Number(match[1]))}
        >
          {part}
        </button>
      )
    })
  }

  const done = state?.letter != null
  const progress = state ? state.nextChapter : 0

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) stopRef.current = true
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpenCheck className="size-4" /> Whole-book read-through
          </DialogTitle>
          <DialogDescription>
            The entire manuscript, read in order on your own key, into an editorial letter —
            chapter notes, pacing, arcs, dangling threads. The bill is on the table first.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {/* ---- The bill, before anything runs. ---- */}
          <div className="rounded-lg border border-border p-3.5 text-sm" data-rt-estimate>
            <p>
              {estimate.chapters} {estimate.chapters === 1 ? 'chapter' : 'chapters'} ·{' '}
              ~{estimate.inputTokens.toLocaleString()} tokens in,{' '}
              ~{estimate.outputTokens.toLocaleString()} out
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <label htmlFor="rt-rate">Your model's rate, $ per million tokens:</label>
              <Input
                id="rt-rate"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="h-7 w-24 text-xs"
                placeholder="e.g. 3"
                inputMode="decimal"
              />
              {cost !== null && (
                <span className="tabular-nums" data-rt-cost>
                  ≈ ${cost.toFixed(2)}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Estimates use the ~4-characters-per-token rule of thumb; your provider's meter is
              the truth.
            </p>
          </div>

          {/* ---- Progress, chapter by chapter. ---- */}
          {state && state.notes.length > 0 && (
            <ol className="space-y-2" data-rt-notes>
              {state.notes.map((note) => (
                <li key={note.chapterIndex} className="rounded-md border border-border p-2.5">
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
                    onClick={() => openChapter(note.chapterIndex + 1)}
                  >
                    Chapter {note.chapterIndex + 1} — {note.chapterTitle}
                  </button>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{note.note}</p>
                </li>
              ))}
            </ol>
          )}

          {phase && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" data-rt-phase>
              <Loader2 className="size-4 animate-spin" /> {phase}
            </p>
          )}

          {/* ---- The letter. ---- */}
          {done && state?.letter && (
            <div className="whitespace-pre-wrap rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm" data-rt-letter>
              {renderLetter(state.letter)}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border pt-3">
          {!done && (
            <Button onClick={() => void run()} disabled={running || book.length === 0} className="gap-1.5">
              {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {state && progress > 0
                ? `Resume from chapter ${progress + 1}`
                : 'Read the whole book'}
            </Button>
          )}
          {running && (
            <Button variant="outline" onClick={() => { stopRef.current = true }} className="gap-1.5">
              <Square className="size-3.5" /> Pause after this chapter
            </Button>
          )}
          {state && !running && (
            <Button
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              onClick={() => {
                clearReadThroughState(projectId)
                setState(null)
              }}
            >
              <RotateCcw className="size-3.5" /> Start over
            </Button>
          )}
          {state && !done && progress > 0 && !running && (
            <p className="text-xs text-muted-foreground">
              {progress} of {book.length} chapters read — the run resumes free of charge for
              what's already done.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
