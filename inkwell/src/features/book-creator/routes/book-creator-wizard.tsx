import { presetForFeature } from '@/lib/ai/feature-preset'
import { usePreferencesStore } from '@/stores/preferences-store'
import { ArrowLeft, ArrowRight, FastForward, Loader2, RotateCcw, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { CastStep, type CastItem } from '@/features/book-creator/components/cast-step'
import { ConceptStep, type ConceptDraft } from '@/features/book-creator/components/concept-step'
import { OutlineStep, type OutlineItem } from '@/features/book-creator/components/outline-step'
import { ReviewStep } from '@/features/book-creator/components/review-step'
import { WizardStepper } from '@/features/book-creator/components/wizard-stepper'
import {
  buildCastPrompt,
  buildOutlinePrompt,
  parseCastResponse,
  parseOutlineResponse,
} from '@/features/book-creator/lib/prompts'
import {
  clearDraft,
  draftHasContent,
  readDraft,
  resolveStepIndex,
  restoredFurthestIndex,
  writeDraft,
  type WizardDraft,
} from '@/features/book-creator/lib/wizard-draft'
import { mergeOutline } from '@/features/book-creator/lib/merge-outline'
import { expandTemplate } from '@/features/templates/lib/templates'
import { cardRepo, chapterRepo, codexRepo, projectRepo, sceneRepo } from '@/lib/db/repositories'
import { resolveProvider } from '@/lib/ai/resolve-provider'
import { useAiGeneration } from '@/lib/ai/use-ai-generation'
import { useAiStore } from '@/stores/ai-store'
import { findTemplate, templateChoices, useTemplateStore } from '@/stores/template-store'
import { rememberHandoff } from '@/features/book-creator/lib/handoff'
import { stepAdvice } from '@/features/book-creator/lib/step-advice'
import { useDocumentTitle } from '@/lib/hooks/use-document-title'

const STEPS = [
  { id: 'concept', label: 'Concept' },
  { id: 'outline', label: 'Outline' },
  { id: 'cast', label: 'Cast' },
  { id: 'review', label: 'Review' },
]

const STEP_IDS = STEPS.map((s) => s.id)

/** Long enough that a sentence isn't stringified letter by letter, short
 *  enough that nobody outruns it. `pagehide` covers the rest. */
const SAVE_DELAY_MS = 400

const DEFAULT_CONCEPT: ConceptDraft = {
  title: '',
  author: '',
  genre: '',
  synopsis: '',
  targetWordCount: 80000,
  pov: 'third-limited',
  tense: 'past',
  structureMode: 'scenes',
  templateId: null,
}

function newOutlineItem(title = '', summary = ''): OutlineItem {
  return { id: crypto.randomUUID(), title, summary }
}

function newCastItem(name = '', role = '', personality = ''): CastItem {
  return { id: crypto.randomUUID(), name, role, personality, addToCodex: true }
}

export function BookCreatorWizard() {
  useDocumentTitle('Book Creator')
  const navigate = useNavigate()
  const { toast } = useToast()

  const presets = useAiStore((s) => s.presets)
  const providers = useAiStore((s) => s.providers)
  const loadAiStore = useAiStore((s) => s.loadAll)
  useEffect(() => {
    loadAiStore()
  }, [loadAiStore])

  const customTemplates = useTemplateStore((s) => s.custom)
  const loadTemplates = useTemplateStore((s) => s.load)
  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  const featurePresets = usePreferencesStore((s) => s.featurePresets)
  const preset = presetForFeature(presets, 'bookCreator', featurePresets)
  // Any working key, not only the one this preset names. See resolve-provider.
  const featureProviders = usePreferencesStore((s) => s.featureProviders)
  const provider = resolveProvider(preset, providers, featureProviders.bookCreator)?.provider
  const aiAvailable = Boolean(preset && provider)

  // Read once, before the first render, so a restored draft is simply what
  // the wizard was already showing rather than something that pops in a
  // frame later.
  const [restored] = useState<WizardDraft | null>(() => {
    const draft = readDraft()
    return draft && draftHasContent(draft) ? draft : null
  })

  const [searchParams, setSearchParams] = useSearchParams()
  const [furthestIndex, setFurthestIndex] = useState(() =>
    restored ? restoredFurthestIndex(STEP_IDS, restored) : 0,
  )
  const [creating, setCreating] = useState(false)
  const [resumeNotice, setResumeNotice] = useState(restored !== null)
  const [leaveOpen, setLeaveOpen] = useState(false)

  // Spread over the defaults rather than replacing them: a draft written by
  // an older build has none of the fields added since, and a wizard that
  // opens with `undefined` in a select is a worse outcome than a lost field.
  const [concept, setConcept] = useState<ConceptDraft>({
    ...DEFAULT_CONCEPT,
    ...restored?.concept,
  })
  const [chapterCount, setChapterCount] = useState(restored?.chapterCount ?? 12)
  const [chapters, setChapters] = useState<OutlineItem[]>(restored?.chapters ?? [])
  const [castCount, setCastCount] = useState(restored?.castCount ?? 4)
  const [cast, setCast] = useState<CastItem[]>(restored?.cast ?? [])

  const outlineGen = useAiGeneration()
  const [outlineError, setOutlineError] = useState<string | null>(null)
  const castGen = useAiGeneration()
  const [castError, setCastError] = useState<string | null>(null)

  // The step lives in the URL, so back means "the step before this one" for
  // the browser's back button, Android's hardware back and iOS's swipe alike
  // — none of which the wizard can intercept, and all of which used to throw
  // away every field the writer had filled in.
  const activeIndex = resolveStepIndex(STEP_IDS, searchParams.get('step'), furthestIndex)

  // A restored draft belongs at the step it was left on. Replacing rather
  // than pushing keeps the entry the writer arrived on as the way out.
  const placedRestoredStep = useRef(false)
  useEffect(() => {
    if (placedRestoredStep.current) return
    placedRestoredStep.current = true
    if (!restored || restored.step === STEP_IDS[0]) return
    setSearchParams({ step: restored.step }, { replace: true })
  }, [restored, setSearchParams])

  function goToStep(index: number) {
    if (index > furthestIndex || index === activeIndex) return
    setSearchParams({ step: STEP_IDS[index] })
  }

  function goNext() {
    const next = Math.min(activeIndex + 1, STEP_IDS.length - 1)
    setFurthestIndex((f) => Math.max(f, next))
    setSearchParams({ step: STEP_IDS[next] })
  }

  function goBack() {
    if (activeIndex === 0) return
    setSearchParams({ step: STEP_IDS[activeIndex - 1] })
  }

  // ── The draft ─────────────────────────────────────────────────────────────
  // Every step used to live in component state alone, so leaving the wizard
  // by any route at all — back, a tab crash, a phone reclaiming memory —
  // discarded up to four steps of typed work with no warning.

  const snapshot = useCallback(
    (): WizardDraft => ({
      concept,
      chapterCount,
      chapters,
      castCount,
      cast,
      step: STEP_IDS[activeIndex],
      furthestIndex,
      savedAt: Date.now(),
    }),
    [concept, chapterCount, chapters, castCount, cast, activeIndex, furthestIndex],
  )

  // Set the moment the draft becomes a real project, so neither the pending
  // save nor the unload flush can resurrect what was just turned into a book.
  const done = useRef(false)
  const latest = useRef(snapshot)

  useEffect(() => {
    latest.current = snapshot
    const draft = snapshot()
    if (done.current || !draftHasContent(draft)) return
    const timer = setTimeout(() => writeDraft(draft), SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [snapshot])

  useEffect(() => {
    // A debounce is a window in which work is unsaved, and closing a tab is
    // exactly the moment that window matters. `pagehide` fires where
    // `beforeunload` is unreliable — notably when iOS discards a background
    // tab, which is the case that loses a wizard nobody thinks they left.
    function flush() {
      const draft = latest.current()
      if (!done.current && draftHasContent(draft)) writeDraft(draft)
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  function startFresh() {
    clearDraft()
    setConcept(DEFAULT_CONCEPT)
    setChapterCount(12)
    setChapters([])
    setCastCount(4)
    setCast([])
    setFurthestIndex(0)
    setResumeNotice(false)
    setSearchParams({}, { replace: true })
  }

  function leave() {
    setLeaveOpen(false)
    navigate('/projects')
  }

  function discardAndLeave() {
    done.current = true
    clearDraft()
    leave()
  }

  function handleCancel() {
    if (draftHasContent(snapshot())) {
      setLeaveOpen(true)
      return
    }
    navigate('/projects')
  }

  async function handleGenerateOutline() {
    if (!preset || !provider) return
    setOutlineError(null)
    const messages = buildOutlinePrompt({
      title: concept.title,
      genre: concept.genre,
      synopsis: concept.synopsis,
      pov: concept.pov,
      tense: concept.tense,
      chapterCount,
    })
    const finalText = await outlineGen.generate({
      provider,
      model: preset.model || provider.defaultModel || '',
      messages,
      temperature: preset.temperature,
      topP: preset.topP,
    })
    const parsed = parseOutlineResponse(finalText)
    if (!parsed) {
      setOutlineError("Could not read the AI's outline — try again, or add chapters by hand below.")
      return
    }
    setChapters(parsed.map((c) => newOutlineItem(c.title, c.summary)))
  }

  async function handleGenerateCast() {
    if (!preset || !provider) return
    setCastError(null)
    const messages = buildCastPrompt({
      title: concept.title,
      genre: concept.genre,
      synopsis: concept.synopsis,
      castCount,
    })
    const finalText = await castGen.generate({
      provider,
      model: preset.model || provider.defaultModel || '',
      messages,
      temperature: preset.temperature,
      topP: preset.topP,
    })
    const parsed = parseCastResponse(finalText)
    if (!parsed) {
      setCastError("Could not read the AI's suggestions — try again, or add characters by hand below.")
      return
    }
    setCast(parsed.map((c) => newCastItem(c.name, c.role, c.personality)))
  }

  /**
   * Everything the book will be made of, worked out before anything is
   * written. The wizard used to create a flat run of chapters and ignore the
   * chosen format entirely, so a "Standard novel" built here had no prologue
   * and a "Screenplay" had chapters.
   */
  const planFor = useCallback(
    (outline: OutlineItem[]) => {
      const template = findTemplate(templateChoices(customTemplates), concept.templateId)
      const scenesPerChapter = concept.structureMode === 'chapters-only' ? 'one' : 'template'
      const plan = template ? expandTemplate(template, { scenesPerChapter }) : []
      return mergeOutline(
        plan,
        outline.map((c) => ({ title: c.title, summary: c.summary })),
        { numbering: template?.numbering ?? 'words', scenesPerChapter },
      )
    },
    [customTemplates, concept.templateId, concept.structureMode],
  )

  const plannedChapters = useMemo(() => planFor(chapters), [planFor, chapters])

  async function handleCreate(options: { conceptOnly?: boolean } = {}) {
    if (!concept.title.trim()) {
      // A correction, not a move — it should not cost a back-press to undo.
      setSearchParams({ step: STEP_IDS[0] }, { replace: true })
      return
    }
    setCreating(true)
    try {
      const project = await projectRepo.create({
        title: concept.title.trim(),
        author: concept.author.trim(),
        synopsis: concept.synopsis.trim(),
        genre: concept.genre.trim(),
        targetWordCount: concept.targetWordCount,
        coverId: null,
        seriesId: null,
        seriesOrder: 0,
        status: 'planning',
        settings: {
          defaultAiPresetId: null,
          pov: concept.pov,
          tense: concept.tense,
          measureWidthCh: 68,
          structureMode: concept.structureMode,
        },
      })

      // The format lays out the divisions; the outline says what happens in
      // them. One pass creates both, so a prologue is a prologue and chapter
      // three carries the summary written for chapter three.
      const planned = options.conceptOnly ? planFor([]) : plannedChapters
      for (const [index, chapter] of planned.entries()) {
        const created = await chapterRepo.create({
          projectId: project.id,
          title: chapter.title.trim() || `Chapter ${index + 1}`,
          order: index,
          status: 'outline',
          kind: chapter.kind,
        })
        for (const [sceneIndex, sceneTitle] of chapter.scenes.entries()) {
          await sceneRepo.create({
            chapterId: created.id,
            projectId: project.id,
            title: sceneTitle,
            order: sceneIndex,
            content: null,
            plainText: '',
            wordCount: 0,
            status: 'outline',
            povCharacterId: null,
            locationCodexId: null,
            // The outline describes the chapter, so it belongs on the scene
            // the writer opens first rather than on every one of them.
            summary: sceneIndex === 0 ? chapter.summary : '',
            beats: [],
            labels: [],
            linkedCodexIds: [],
          })
        }
      }

      let charactersCreated = 0
      for (const character of options.conceptOnly ? [] : cast) {
        if (!character.name.trim()) continue
        charactersCreated += 1
        let codexEntryId: string | null = null
        if (character.addToCodex) {
          const entry = await codexRepo.create({
            projectId: project.id,
            seriesId: null,
            type: 'character',
            name: character.name.trim(),
            aliases: [],
            summary: character.role.trim(),
            body: '',
            plainText: '',
            attributes: [],
            relationships: [],
            imageId: null,
            tags: [],
            aiContext: 'when-relevant',
            aiContextTokenBudget: null,
          })
          codexEntryId = entry.id
        }
        await cardRepo.create({
          projectId: project.id,
          codexEntryId,
          displayName: character.name.trim(),
          avatarImageId: null,
          cropSettings: null,
          description: character.role.trim(),
          personality: character.personality.trim(),
          scenario: '',
          firstMessage: '',
          exampleDialogue: [],
          systemPromptOverride: null,
          voiceNotes: '',
          tags: [],
        })
      }

      // The draft has become a book; it has nothing left to protect, and
      // leaving it would offer to resume a project that already exists.
      done.current = true
      clearDraft()

      // Everything the wizard made is real but invisible — the cast most of
      // all, since it lives on a page the writer has no reason to open. The
      // editor says so once, on arrival.
      rememberHandoff({
        projectId: project.id,
        chapters: planned.length,
        scenes: planned.reduce((n, c) => n + c.scenes.length, 0),
        characters: charactersCreated,
        cards: charactersCreated > 0,
        templateName:
          findTemplate(templateChoices(customTemplates), concept.templateId)?.name ?? '',
      })

      toast({ title: `"${project.title}" created` })
      navigate(`/editor?project=${project.id}`)
    } catch {
      toast({ title: 'Could not create the book', variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  const onLastStep = activeIndex === STEP_IDS.length - 1
  const advice = stepAdvice(STEP_IDS[activeIndex], {
    title: concept.title,
    chapters,
    cast,
  })
  const nextDisabled = Boolean(advice.block)

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <h1 className="font-serif text-lg font-semibold">Book Creator</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
        <WizardStepper
          steps={STEPS}
          activeIndex={activeIndex}
          furthestIndex={furthestIndex}
          onSelect={goToStep}
        />
        {resumeNotice && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-accent/40 px-3 py-2 text-sm">
            <RotateCcw className="size-4 shrink-0 text-primary" aria-hidden />
            <p className="min-w-0 flex-1">Picked up where you left off.</p>
            <Button variant="ghost" size="sm" className="shrink-0" onClick={startFresh}>
              Start fresh
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => setResumeNotice(false)}
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </Button>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-5 sm:p-8">
        {activeIndex === 0 && (
          <ConceptStep draft={concept} onChange={(changes) => setConcept((c) => ({ ...c, ...changes }))} />
        )}
        {activeIndex === 1 && (
          <OutlineStep
            chapterCount={chapterCount}
            onChapterCountChange={setChapterCount}
            chapters={chapters}
            onAdd={() => setChapters((c) => [...c, newOutlineItem()])}
            onUpdate={(id, changes) =>
              setChapters((list) => list.map((c) => (c.id === id ? { ...c, ...changes } : c)))
            }
            onRemove={(id) => setChapters((list) => list.filter((c) => c.id !== id))}
            onMove={(id, direction) =>
              setChapters((list) => {
                const index = list.findIndex((c) => c.id === id)
                const target = index + direction
                if (target < 0 || target >= list.length) return list
                const next = [...list]
                ;[next[index], next[target]] = [next[target], next[index]]
                return next
              })
            }
            onGenerate={handleGenerateOutline}
            generating={outlineGen.streaming}
            aiAvailable={aiAvailable}
            error={outlineError}
          />
        )}
        {activeIndex === 2 && (
          <CastStep
            castCount={castCount}
            onCastCountChange={setCastCount}
            cast={cast}
            onAdd={() => setCast((c) => [...c, newCastItem()])}
            onUpdate={(id, changes) => setCast((list) => list.map((c) => (c.id === id ? { ...c, ...changes } : c)))}
            onRemove={(id) => setCast((list) => list.filter((c) => c.id !== id))}
            onGenerate={handleGenerateCast}
            generating={castGen.streaming}
            aiAvailable={aiAvailable}
            error={castError}
          />
        )}
        {activeIndex === 3 && (
          <ReviewStep concept={concept} chapters={plannedChapters} cast={cast} />
        )}
      </div>

      <footer className="border-t border-border px-4 py-3 sm:px-6">
        {/* Muted even when blocking: the button is disabled, so this is
            guidance about what comes next, and red on a form the writer has
            not touched yet reads as a telling-off. */}
        {(advice.block || advice.note) && (
          <p
            className="mb-2 text-xs text-muted-foreground"
            role={advice.block ? 'alert' : 'status'}
          >
            {advice.block ?? advice.note}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" onClick={goBack} disabled={activeIndex === 0} className="gap-1.5">
            <ArrowLeft className="size-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            {/* The wizard is four steps long, and some days a writer has the
                idea and nothing else. Making the book from the concept alone
                is a real answer, not an escape hatch. */}
            {!onLastStep && concept.title.trim() !== '' && (
              <Button
                variant="ghost"
                onClick={() => handleCreate({ conceptOnly: true })}
                disabled={creating}
                className="hidden gap-1.5 sm:inline-flex"
              >
                <FastForward className="size-4" /> Just make the book
              </Button>
            )}
            {onLastStep ? (
              <Button
                onClick={() => handleCreate()}
                disabled={creating || !concept.title.trim()}
                className="gap-1.5"
              >
                {creating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {creating ? 'Creating…' : 'Create book'}
              </Button>
            ) : (
              <Button onClick={goNext} disabled={nextDisabled} className="gap-1.5">
                Next <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
        {!onLastStep && concept.title.trim() !== '' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCreate({ conceptOnly: true })}
            disabled={creating}
            className="mt-2 w-full gap-1.5 sm:hidden"
          >
            <FastForward className="size-4" /> Just make the book
          </Button>
        )}
      </footer>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave the Book Creator?</AlertDialogTitle>
            <AlertDialogDescription>
              Your draft is kept on this device, so coming back picks up exactly where you left
              off. Nothing has been added to your library yet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-between">
            <Button
              variant="ghost"
              onClick={discardAndLeave}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Discard draft
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <AlertDialogCancel className="mt-0">Keep writing</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  leave()
                }}
              >
                Leave
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
