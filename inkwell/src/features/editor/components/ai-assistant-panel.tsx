import type { Editor } from '@tiptap/react'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  RotateCcw,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import {
  getSelectionRange,
  getSelectionText,
  insertAfter,
  replaceOrAppend,
  type EditorRange,
} from '@/features/editor/lib/ai-insert'
import { AiFailureNotice } from '@/components/common/ai-failure-notice'
import { ContextPreview } from '@/components/common/context-preview'
import { presetForFeature } from '@/lib/ai/feature-preset'
import { usePreferencesStore } from '@/stores/preferences-store'
import { buildPrompt } from '@/lib/ai/prompt-builder'
import { resolveProvider } from '@/lib/ai/resolve-provider'
import { useAiGeneration } from '@/lib/ai/use-ai-generation'
import { useAiStore } from '@/stores/ai-store'
import { useEditorStore } from '@/stores/editor-store'
import type { AiActionKind, CodexEntry, PointOfView, Scene, Tense } from '@/types'

const ACTION_OPTIONS: { value: AiActionKind; label: string; needsInstruction: boolean; needsSelection: boolean }[] = [
  { value: 'continue', label: 'Continue', needsInstruction: false, needsSelection: false },
  { value: 'rewrite', label: 'Rewrite', needsInstruction: true, needsSelection: true },
  { value: 'describe', label: 'Describe', needsInstruction: true, needsSelection: false },
  { value: 'brainstorm', label: 'Brainstorm', needsInstruction: true, needsSelection: false },
  { value: 'summarise', label: 'Summarise scene', needsInstruction: false, needsSelection: false },
  { value: 'beats-to-prose', label: 'Beats → prose', needsInstruction: false, needsSelection: false },
]

function beatsToInstruction(scene: Scene): string {
  const usable = scene.beats.filter((b) => b.text.trim())
  return usable.map((b, i) => `${i + 1}. ${b.text.trim()}`).join('\n')
}

interface AiAssistantPanelProps {
  scene: Scene
  editor: Editor | null
  codexEntries: CodexEntry[]
  pov: PointOfView
  tense: Tense
  onClose: () => void
}

export function AiAssistantPanel({ scene, editor, codexEntries, pov, tense, onClose }: AiAssistantPanelProps) {
  const presets = useAiStore((s) => s.presets)
  const providers = useAiStore((s) => s.providers)
  const updateSceneMeta = useEditorStore((s) => s.updateSceneMeta)
  const { toast } = useToast()

  const [action, setAction] = useState<AiActionKind>('continue')
  const [instruction, setInstruction] = useState('')
  const featurePresets = usePreferencesStore((s) => s.featurePresets)
  const [presetId, setPresetId] = useState(
    presetForFeature(presets, 'editorActions', featurePresets)?.id ?? '',
  )
  const [showContext, setShowContext] = useState(false)
  const [capturedRange, setCapturedRange] = useState<EditorRange | null>(null)
  const [capturedText, setCapturedText] = useState('')

  const { output, streaming, failure, usage, attempt, generate, stop, reset } = useAiGeneration()

  const actionMeta = ACTION_OPTIONS.find((a) => a.value === action)!
  const preset = presets.find((p) => p.id === presetId)
  // Any working key, not only the one this preset names — the shipped
  // presets start pointing at nothing, so the strict lookup left a writer
  // with a valid key and no explanation for the silence.
  const featureProviders = usePreferencesStore((s) => s.featureProviders)
  const resolved = resolveProvider(preset, providers, featureProviders.editorActions)
  const provider = resolved?.provider

  const liveSelectionText = editor ? getSelectionText(editor) : ''

  const precedingText = useMemo(() => {
    if (!editor) return scene.plainText
    if (action === 'summarise') return scene.plainText
    const { from } = editor.state.selection
    return editor.state.doc.textBetween(0, from, '\n\n')
  }, [editor, scene.plainText, action])

  const beatsInstruction = useMemo(() => beatsToInstruction(scene), [scene])
  const effectiveInstruction = action === 'beats-to-prose' ? beatsInstruction : instruction

  const built = useMemo(() => {
    if (!preset) return null
    return buildPrompt({
      preset,
      action,
      instruction: effectiveInstruction,
      precedingText,
      selectedText: actionMeta.needsSelection ? capturedText || liveSelectionText : undefined,
      codexEntries,
      pov,
      tense,
    })
  }, [preset, action, effectiveInstruction, precedingText, actionMeta.needsSelection, capturedText, liveSelectionText, codexEntries, pov, tense])

  function handleActionChange(next: AiActionKind) {
    setAction(next)
    reset()
    setCapturedRange(null)
    setCapturedText('')
  }

  async function handleGenerate() {
    if (!preset || !provider) return
    if (actionMeta.needsSelection) {
      const range = getSelectionRange(editor)
      const text = getSelectionText(editor)
      if (!text) {
        toast({ title: 'Select some text in the manuscript first', variant: 'destructive' })
        return
      }
      setCapturedRange(range)
      setCapturedText(text)
    }
    if (!built) return
    await generate({
      provider,
      model: preset.model || provider.defaultModel || '',
      messages: built.messages,
      temperature: preset.temperature,
      topP: preset.topP,
    })
  }

  function handleDiscard() {
    reset()
  }

  function handleInsert(mode: 'replace' | 'insert-after' | 'append') {
    if (!output) return
    if (mode === 'replace') replaceOrAppend(editor, capturedRange, output)
    else if (mode === 'insert-after') insertAfter(editor, capturedRange, output)
    else replaceOrAppend(editor, null, `\n\n${output}`)
    toast({ title: 'Added to the manuscript' })
    reset()
  }

  async function handleInsertBeats() {
    if (!output) return
    replaceOrAppend(editor, null, `\n\n${output}`)
    const usedIds = new Set(scene.beats.filter((b) => b.text.trim()).map((b) => b.id))
    await updateSceneMeta(scene.id, {
      beats: scene.beats.map((b) => (usedIds.has(b.id) ? { ...b, generated: true } : b)),
    })
    toast({ title: 'Added to the manuscript' })
    reset()
  }

  async function handleSaveSummary() {
    if (!output) return
    await updateSceneMeta(scene.id, { summary: output.trim() })
    toast({ title: 'Saved as scene summary' })
    reset()
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(output)
    toast({ title: 'Copied' })
  }

  if (providers.length === 0 || presets.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader onClose={onClose} />
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div className="space-y-2">
            <Sparkles className="mx-auto size-6 text-muted-foreground/50" />
            <p className="text-sm font-medium">No AI provider set up yet</p>
            <p className="text-xs text-muted-foreground">
              Add a provider and preset in Settings → AI to use writing actions.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader onClose={onClose} />

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-3">
          <Select value={action} onValueChange={(v: AiActionKind) => handleActionChange(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={presetId} onValueChange={setPresetId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a preset" />
            </SelectTrigger>
            <SelectContent>
              {presets.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {preset && !provider && (
            <p className="text-xs text-destructive">
              This preset has no provider selected — edit it in Settings.
            </p>
          )}

          {actionMeta.needsSelection && (
            <div className="rounded-md border border-dashed border-border p-2.5 text-xs text-muted-foreground">
              {liveSelectionText || capturedText
                ? `Selected: "${(liveSelectionText || capturedText).slice(0, 80)}${(liveSelectionText || capturedText).length > 80 ? '…' : ''}"`
                : 'Select some text in the manuscript to rewrite it.'}
            </div>
          )}

          {actionMeta.needsInstruction && (
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={
                action === 'rewrite'
                  ? 'How should it change? e.g. tighter, more tense, present tense'
                  : action === 'describe'
                    ? 'What are we describing? e.g. the abandoned lighthouse at dusk'
                    : 'What are we brainstorming? e.g. reasons the letter never arrived'
              }
              rows={2}
            />
          )}

          {action === 'beats-to-prose' &&
            (beatsInstruction ? (
              <div className="whitespace-pre-wrap rounded-md border border-dashed border-border p-2.5 text-xs text-muted-foreground">
                {beatsInstruction}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-border p-2.5 text-xs text-muted-foreground">
                No beats yet — add some in Scene details first.
              </p>
            ))}

          <div>
            <button
              type="button"
              onClick={() => setShowContext((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {showContext ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              ≈ {built?.estimatedTokens.toLocaleString() ?? 0} tokens · What the AI sees
            </button>
            {showContext && built && (
              <div className="mt-2 rounded-md border border-border bg-muted/40 p-2.5">
                <ContextPreview plan={built.plan} />
              </div>
            )}
          </div>

          {streaming ? (
            <Button variant="outline" onClick={stop} className="gap-1.5">
              <Square className="size-3.5" /> Stop
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              disabled={
                !preset ||
                !provider ||
                (actionMeta.needsInstruction && action !== 'rewrite' && !instruction.trim()) ||
                (action === 'beats-to-prose' && !beatsInstruction)
              }
              className="gap-1.5"
            >
              <Sparkles className="size-3.5" /> Generate
            </Button>
          )}

          {failure && <AiFailureNotice failure={failure} onRetry={handleGenerate} />}

          {streaming && attempt > 1 && (
            <p className="text-xs text-muted-foreground">
              Connection dropped — trying again ({attempt} of 2)…
            </p>
          )}

          {usage && !streaming && (
            <p className="text-xs text-muted-foreground">
              {usage.characters.toLocaleString()} characters in {(usage.ms / 1000).toFixed(1)}s
            </p>
          )}

          {(output || streaming) && (
            <div className="grid gap-2">
              <div className="editor-prose max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-card p-3 text-sm">
                {output}
                {streaming && (
                  <Loader2 className="ml-1 inline size-3.5 animate-spin text-muted-foreground" />
                )}
              </div>

              {!streaming && output && (
                <div className="flex flex-wrap gap-1.5">
                  {action === 'continue' && (
                    <Button size="sm" onClick={() => handleInsert('append')}>
                      Insert
                    </Button>
                  )}
                  {action === 'rewrite' && (
                    <Button size="sm" onClick={() => handleInsert('replace')}>
                      Replace selection
                    </Button>
                  )}
                  {action === 'describe' && (
                    <Button size="sm" onClick={() => handleInsert('insert-after')}>
                      Insert at cursor
                    </Button>
                  )}
                  {action === 'summarise' && (
                    <Button size="sm" onClick={handleSaveSummary}>
                      Save as summary
                    </Button>
                  )}
                  {action === 'beats-to-prose' && (
                    <Button size="sm" onClick={handleInsertBeats}>
                      Insert
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={handleGenerate} className="gap-1">
                    <RotateCcw className="size-3.5" /> Retry
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1">
                    <Copy className="size-3.5" /> Copy
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleDiscard}>
                    Discard
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PanelHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="size-4" /> AI Assistant
      </h2>
      <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Close AI assistant">
        <X className="size-4" />
      </Button>
    </div>
  )
}
