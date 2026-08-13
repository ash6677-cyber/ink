import { Loader2, MessageSquareQuote, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import {
  buildVoiceCheckMessages,
  extractDialogue,
  voiceStats,
  type DialogueLine,
} from '@/features/planning/lib/dialogue'
import { presetForFeature } from '@/lib/ai/feature-preset'
import { resolveProvider } from '@/lib/ai/resolve-provider'
import { useAiGeneration } from '@/lib/ai/use-ai-generation'
import { cn } from '@/lib/utils'
import { useAiStore } from '@/stores/ai-store'
import { useEditorStore } from '@/stores/editor-store'
import { usePreferencesStore } from '@/stores/preferences-store'

/**
 * The dialogue pass: every spoken line in one continuous read — the
 * fastest way to hear a voice wobble — with per-voice stats from naive,
 * honest tag attribution, and an optional AI consistency check per voice
 * on the writer's own key.
 */
export function DialogueView({ projectId }: { projectId: string }) {
  const scenes = useEditorStore((s) => s.scenes)
  const chapters = useEditorStore((s) => s.chapters)
  const navigate = useNavigate()
  const { toast } = useToast()

  const lines = useMemo(() => {
    const chapterOrder = new Map(chapters.map((c) => [c.id, c.order]))
    const chapterTitle = new Map(chapters.map((c) => [c.id, c.title]))
    const ordered = [...scenes].sort(
      (a, b) =>
        (chapterOrder.get(a.chapterId) ?? 0) - (chapterOrder.get(b.chapterId) ?? 0) ||
        a.order - b.order,
    )
    return extractDialogue(
      ordered.map((s) => ({
        sceneId: s.id,
        sceneTitle: s.title || 'Untitled scene',
        chapterTitle: chapterTitle.get(s.chapterId) ?? 'Untitled chapter',
        plainText: s.plainText,
      })),
    )
  }, [scenes, chapters])

  const stats = useMemo(() => voiceStats(lines), [lines])

  const [selected, setSelected] = useState<string | null | 'all'>('all')
  const shown = selected === 'all' ? lines : lines.filter((l) => l.speaker === selected)

  // ---- The optional AI voice check, on the writer's own key. ----
  // Planning never loads the AI store on its own (the editor does), so the
  // check would otherwise see no keys even when Settings has them.
  const aiStatus = useAiStore((s) => s.status)
  const loadAiStore = useAiStore((s) => s.loadAll)
  useEffect(() => {
    if (aiStatus === 'idle') void loadAiStore()
  }, [aiStatus, loadAiStore])
  const presets = useAiStore((s) => s.presets)
  const providers = useAiStore((s) => s.providers)
  const featurePresets = usePreferencesStore((s) => s.featurePresets)
  const featureProviders = usePreferencesStore((s) => s.featureProviders)
  const preset = presetForFeature(presets, 'voice', featurePresets)
  const provider = resolveProvider(preset, providers, featureProviders.voice)?.provider
  const { streaming, failure, generate } = useAiGeneration()
  const [verdict, setVerdict] = useState<{ speaker: string; text: string } | null>(null)

  async function handleVoiceCheck(speaker: string, spoken: DialogueLine[]) {
    if (!preset || !provider) {
      toast({ title: 'Add an AI key in Settings first', variant: 'destructive' })
      return
    }
    setVerdict(null)
    const raw = await generate({
      provider,
      model: preset.model || provider.defaultModel || '',
      messages: buildVoiceCheckMessages(speaker, spoken),
      temperature: 0,
      topP: 1,
    })
    if (raw.trim()) setVerdict({ speaker, text: raw.trim() })
  }

  const open = (sceneId: string) => navigate(`/editor?project=${projectId}&scene=${sceneId}`)

  if (lines.length === 0) {
    return (
      <EmptyState
        icon={MessageSquareQuote}
        title="No dialogue yet"
        description="Once your scenes have spoken lines in quotation marks, they read out here as one continuous conversation, voice by voice."
        className="border-none bg-transparent"
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 sm:p-6 lg:flex-row" data-dialogue>
      {/* ---- The voices. ---- */}
      <aside className="shrink-0 space-y-1.5 lg:w-72" data-dialogue-voices>
        <button
          type="button"
          onClick={() => setSelected('all')}
          className={cn(
            'w-full rounded-md border px-3 py-2 text-left text-sm',
            selected === 'all' ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
          )}
        >
          Every voice · {lines.length} lines
        </button>
        {stats.map((voice) => (
          <button
            key={voice.speaker ?? '∅'}
            type="button"
            onClick={() => setSelected(voice.speaker)}
            className={cn(
              'w-full rounded-md border px-3 py-2 text-left',
              selected === voice.speaker
                ? 'border-primary bg-primary/10'
                : 'border-border hover:bg-accent',
            )}
          >
            <span className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium">
                {voice.speaker ?? 'Unattributed'}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {Math.round(voice.share * 100)}%
              </span>
            </span>
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary/60"
                style={{ width: `${Math.max(2, Math.round(voice.share * 100))}%` }}
              />
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {voice.lines} {voice.lines === 1 ? 'line' : 'lines'} ·{' '}
              {Math.round(voice.avgLineWords)} words a line
              {voice.favourites.length > 0 && <> · says {voice.favourites.join(', ')}</>}
            </span>
          </button>
        ))}
      </aside>

      {/* ---- The continuous read. ---- */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {selected !== 'all' && selected !== null && (
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Everything {selected} says, in order — read it straight through and listen.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={streaming}
              onClick={() => void handleVoiceCheck(selected, shown)}
            >
              {streaming ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              Check this voice
            </Button>
          </div>
        )}

        {failure && <p className="mb-3 text-sm text-destructive">{failure.message}</p>}
        {verdict && verdict.speaker === selected && (
          <div
            className="mb-3 whitespace-pre-wrap rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"
            data-voice-verdict
          >
            {verdict.text}
          </div>
        )}

        <ol className="space-y-1.5">
          {shown.map((line, index) => (
            <li key={`${line.sceneId}-${index}`}>
              <button
                type="button"
                onClick={() => open(line.sceneId)}
                className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
              >
                <span className="text-sm">“{line.quote}”</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {line.speaker ?? '—'} · {line.sceneTitle}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
