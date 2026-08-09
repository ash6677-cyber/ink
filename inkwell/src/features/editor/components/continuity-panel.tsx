import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react'
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
import { presetForFeature } from '@/lib/ai/feature-preset'
import {
  buildContinuityMessages,
  CONTINUITY_SEVERITY_LABEL,
  factSheet,
  parseContinuityFindings,
  type ContinuityFinding,
} from '@/lib/ai/continuity'
import { resolveProvider } from '@/lib/ai/resolve-provider'
import { useAiGeneration } from '@/lib/ai/use-ai-generation'
import { useAiStore } from '@/stores/ai-store'
import { usePreferencesStore } from '@/stores/preferences-store'
import type { CodexEntry, Scene } from '@/types'

/**
 * The continuity sentinel: checks the open scene against the established
 * facts in the Almanac and flags where they disagree. It only ever
 * reports — the writer decides what's a real slip and what's intentional.
 * Uses the writer's own key and their editor-actions preset.
 */
export function ContinuityPanel({
  open,
  onOpenChange,
  scene,
  codexEntries,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  scene: Scene
  codexEntries: CodexEntry[]
}) {
  const { toast } = useToast()
  const presets = useAiStore((s) => s.presets)
  const providers = useAiStore((s) => s.providers)
  const featurePresets = usePreferencesStore((s) => s.featurePresets)
  const { streaming, failure, generate } = useAiGeneration()

  const [findings, setFindings] = useState<ContinuityFinding[] | null>(null)

  const preset = presetForFeature(presets, 'editorActions', featurePresets)
  const provider = resolveProvider(preset, providers)?.provider
  const hasFacts = factSheet(codexEntries).length > 0

  async function handleRun() {
    if (!preset || !provider) {
      toast({ title: 'Add an AI key in Settings first', variant: 'destructive' })
      return
    }
    if (!hasFacts) {
      toast({ title: 'No Almanac facts to check against yet' })
      return
    }
    if (!scene.plainText.trim()) {
      toast({ title: 'This scene is empty' })
      return
    }
    setFindings(null)
    const raw = await generate({
      provider,
      model: preset.model || provider.defaultModel || '',
      messages: buildContinuityMessages(scene.plainText, codexEntries),
      temperature: 0,
      topP: 1,
    })
    setFindings(parseContinuityFindings(raw, codexEntries))
  }

  const hasRun = findings !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" /> Continuity check
          </DialogTitle>
          <DialogDescription>
            Reads this scene against your Almanac and flags where they disagree — an eye
            colour, a place, a broken timeline. It only points; you decide. Uses your own AI key.
          </DialogDescription>
        </DialogHeader>

        {failure && <p className="text-sm text-destructive">{failure.message}</p>}

        {!hasFacts && (
          <p className="text-sm text-muted-foreground">
            Add some facts to your Almanac entries (summaries or attributes like “Eyes: grey”)
            and the sentinel will have something to check against.
          </p>
        )}

        {streaming && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking against the Almanac…
          </p>
        )}

        {hasRun && !streaming && findings.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing conflicts with your Almanac. The scene holds.
          </p>
        )}

        {findings && findings.length > 0 && (
          <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {findings.map((f) => (
              <li key={f.id} className="rounded-md border border-border bg-muted/40 p-2.5">
                <div className="mb-1 flex items-center gap-1.5">
                  <AlertTriangle
                    className={
                      f.severity === 'contradiction'
                        ? 'size-3.5 text-destructive'
                        : 'size-3.5 text-warning'
                    }
                  />
                  <span className="text-xs font-medium">
                    {CONTINUITY_SEVERITY_LABEL[f.severity]} · {f.entryName}
                  </span>
                </div>
                <p className="text-sm">
                  <span className="text-muted-foreground">Almanac: </span>
                  {f.fact}
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Scene: </span>
                  {f.sceneClaim}
                </p>
                {f.explanation && (
                  <p className="mt-1 text-xs text-muted-foreground">{f.explanation}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button onClick={() => void handleRun()} disabled={streaming || !hasFacts}>
            {streaming ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            {hasRun ? 'Check again' : 'Check continuity'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
