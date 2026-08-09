import type { Editor } from '@tiptap/react'
import { Check, Loader2, SpellCheck, X } from 'lucide-react'
import { useState } from 'react'

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
import { findMatches, replaceRange } from '@/features/editor/lib/text-search'
import { presetForFeature } from '@/lib/ai/feature-preset'
import {
  buildProofreadMessages,
  parseProofreadSuggestions,
  PROOFREAD_CATEGORY_LABEL,
  type ProofreadSuggestion,
} from '@/lib/ai/proofread'
import { resolveProvider } from '@/lib/ai/resolve-provider'
import { useAiGeneration } from '@/lib/ai/use-ai-generation'
import { useAiStore } from '@/stores/ai-store'
import { usePreferencesStore } from '@/stores/preferences-store'
import type { Scene } from '@/types'

/**
 * A proofreading pass over the open scene: a light copy-edit surfaced as
 * accept/reject cards. Nothing changes in the manuscript until the writer
 * clicks a fix — the AI only ever proposes. Uses the writer's own key and
 * their chosen editor-actions preset, exactly like the assistant.
 */
export function ProofreadPanel({
  open,
  onOpenChange,
  scene,
  editor,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  scene: Scene
  editor: Editor | null
}) {
  const { toast } = useToast()
  const presets = useAiStore((s) => s.presets)
  const providers = useAiStore((s) => s.providers)
  const featurePresets = usePreferencesStore((s) => s.featurePresets)
  const { streaming, failure, generate } = useAiGeneration()

  const [suggestions, setSuggestions] = useState<ProofreadSuggestion[] | null>(null)
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set())

  const preset = presetForFeature(presets, 'editorActions', featurePresets)
  const provider = resolveProvider(preset, providers)?.provider

  async function handleRun() {
    if (!preset || !provider) {
      toast({ title: 'Add an AI key in Settings first', variant: 'destructive' })
      return
    }
    setSuggestions(null)
    setResolvedIds(new Set())
    const passage = scene.plainText
    if (!passage.trim()) {
      toast({ title: 'This scene is empty' })
      return
    }
    const raw = await generate({
      provider,
      model: preset.model || provider.defaultModel || '',
      messages: buildProofreadMessages(passage),
      temperature: 0, // proofreading wants determinism, not invention
      topP: 1,
    })
    setSuggestions(parseProofreadSuggestions(raw, { passage }))
  }

  function accept(s: ProofreadSuggestion) {
    if (!editor) return
    // Apply to the first live occurrence of the exact text. Anchored by the
    // parser to text that really exists, so this can't corrupt anything.
    const matches = findMatches(editor, s.original, true)
    if (matches.length === 0) {
      toast({ title: 'That passage has changed — skipping', variant: 'destructive' })
    } else {
      replaceRange(editor, matches[0], s.suggestion)
    }
    setResolvedIds((prev) => new Set(prev).add(s.id))
  }

  function reject(s: ProofreadSuggestion) {
    setResolvedIds((prev) => new Set(prev).add(s.id))
  }

  const pending = suggestions?.filter((s) => !resolvedIds.has(s.id)) ?? []
  const hasRun = suggestions !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SpellCheck className="size-4" /> Proofread this scene
          </DialogTitle>
          <DialogDescription>
            A light copy-edit — typos, grammar, repeated words, echoes. Nothing changes
            until you accept a fix. Uses your own AI key.
          </DialogDescription>
        </DialogHeader>

        {failure && <p className="text-sm text-destructive">{failure.message}</p>}

        {!hasRun && !streaming && (
          <p className="text-sm text-muted-foreground">
            Reads the open scene and suggests small fixes you can accept one at a time.
          </p>
        )}

        {streaming && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Reading the scene…
          </p>
        )}

        {hasRun && !streaming && pending.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {suggestions && suggestions.length > 0
              ? 'All suggestions handled — nice work.'
              : 'Nothing to fix here. This scene reads clean.'}
          </p>
        )}

        {pending.length > 0 && (
          <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {pending.map((s) => (
              <li key={s.id} className="rounded-md border border-border bg-muted/40 p-2.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                    {PROOFREAD_CATEGORY_LABEL[s.category]}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Accept this fix"
                      onClick={() => accept(s)}
                    >
                      <Check className="size-4 text-emerald-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Dismiss this fix"
                      onClick={() => reject(s)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm">
                  <span className="text-destructive line-through">{s.original}</span>{' '}
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {s.suggestion || '(delete)'}
                  </span>
                </p>
                {s.explanation && (
                  <p className="mt-1 text-xs text-muted-foreground">{s.explanation}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button onClick={() => void handleRun()} disabled={streaming}>
            {streaming ? <Loader2 className="size-4 animate-spin" /> : <SpellCheck className="size-4" />}
            {hasRun ? 'Proofread again' : 'Proofread'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
