import { Check, Loader2, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useToast } from '@/components/ui/use-toast'
import {
  buildCoverImagePrompt,
  imageRequestFor,
  isImageCapable,
  parseImageResults,
} from '@/lib/ai/cover-concept'
import { imageAssetRepo } from '@/lib/db/repositories'
import { useAiStore } from '@/stores/ai-store'
import type { Project } from '@/types'

interface Concept {
  objectUrl: string
  blob: Blob
}

/**
 * AI cover concepts, on the writer's own key. Only providers whose API
 * family serves an images endpoint are offered; with none connected the
 * dialog says exactly that instead of pretending. Generated art carries
 * no lettering — the typography stays Cover Studio's, editable as ever.
 */
export function CoverConceptsDialog({
  open,
  onOpenChange,
  project,
  onUseImage,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project
  onUseImage: (imageId: string) => Promise<void> | void
}) {
  const { toast } = useToast()
  const providers = useAiStore((s) => s.providers)
  const loadAiStore = useAiStore((s) => s.loadAll)
  useEffect(() => {
    loadAiStore()
  }, [loadAiStore])

  const imageProviders = providers.filter((p) => p.enabled !== false && isImageCapable(p))

  const [providerId, setProviderId] = useState('')
  const [model, setModel] = useState('')
  const [mood, setMood] = useState('')
  const [busy, setBusy] = useState(false)
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [usingIndex, setUsingIndex] = useState<number | null>(null)

  const provider =
    imageProviders.find((p) => p.id === providerId) ?? imageProviders[0] ?? null

  async function generate() {
    if (!provider) return
    const prompt = buildCoverImagePrompt({
      title: project.title,
      genre: project.genre,
      synopsis: project.synopsis,
      mood,
    })
    const request = imageRequestFor(provider, model || provider.defaultModel || '', prompt, 2)
    if (!request) return
    setBusy(true)
    try {
      const response = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: request.body,
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`The provider said no (${response.status}). ${detail.slice(0, 200)}`)
      }
      const results = parseImageResults(await response.json())
      if (results.length === 0) throw new Error('The provider returned no images.')

      const next: Concept[] = []
      for (const result of results) {
        let blob: Blob | null = null
        if (result.b64) {
          const bytes = Uint8Array.from(atob(result.b64), (c) => c.charCodeAt(0))
          blob = new Blob([bytes], { type: 'image/png' })
        } else if (result.url) {
          blob = await (await fetch(result.url)).blob()
        }
        if (blob) next.push({ blob, objectUrl: URL.createObjectURL(blob) })
      }
      setConcepts((old) => {
        old.forEach((c) => URL.revokeObjectURL(c.objectUrl))
        return next
      })
    } catch (error) {
      toast({
        title: 'Could not generate concepts',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  async function use(index: number) {
    const concept = concepts[index]
    if (!concept) return
    setUsingIndex(index)
    try {
      const bitmap = await createImageBitmap(concept.blob).catch(() => null)
      const asset = await imageAssetRepo.create({
        blob: concept.blob,
        mimeType: concept.blob.type || 'image/png',
        width: bitmap?.width ?? 1024,
        height: bitmap?.height ?? 1536,
        fileName: `${project.title || 'cover'}-concept.png`,
      })
      bitmap?.close()
      await onUseImage(asset.id)
      onOpenChange(false)
      toast({ title: 'Concept set as the cover image', description: 'Crop and typography are yours to finish.' })
    } finally {
      setUsingIndex(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>AI cover concepts</DialogTitle>
          <DialogDescription>
            Drawn with your own key, from what the book already knows about itself. The art
            comes with no lettering — the title stays yours to set.
          </DialogDescription>
        </DialogHeader>

        {imageProviders.length === 0 ? (
          <p className="rounded-md border border-border bg-accent/30 p-3 text-sm text-muted-foreground">
            None of your AI providers can generate images. Add an OpenAI or OpenAI-compatible
            provider in Settings → AI and it will be offered here.
          </p>
        ) : (
          <div className="space-y-3">
            {imageProviders.length > 1 && (
              <div className="grid gap-1.5">
                <Label>Provider</Label>
                <Select value={provider?.id ?? ''} onValueChange={setProviderId}>
                  <SelectTrigger aria-label="Image provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {imageProviders.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="concept-model">Image model</Label>
              <Input
                id="concept-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={provider?.defaultModel || 'gpt-image-1'}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="concept-mood">Art direction (optional)</Label>
              <Textarea
                id="concept-mood"
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                placeholder="Cold light, one small figure against a huge tide…"
                rows={2}
              />
            </div>
            <Button onClick={() => void generate()} disabled={busy} className="w-full gap-1.5">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy ? 'Painting…' : concepts.length > 0 ? 'Generate again' : 'Generate 2 concepts'}
            </Button>

            {concepts.length > 0 && (
              <div className="grid grid-cols-2 gap-3" data-cover-concepts>
                {concepts.map((concept, index) => (
                  <figure key={concept.objectUrl} className="space-y-1.5">
                    <img
                      src={concept.objectUrl}
                      alt={`Cover concept ${index + 1}`}
                      className="aspect-[2/3] w-full rounded-md border border-border object-cover"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1"
                      disabled={usingIndex !== null}
                      onClick={() => void use(index)}
                    >
                      {usingIndex === index ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Check className="size-3.5" />
                      )}
                      Use as cover
                    </Button>
                  </figure>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
