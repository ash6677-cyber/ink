import { Check, ExternalLink as ExternalLinkIcon, Loader2, PlugZap } from 'lucide-react'

import { ExternalLink } from '@/components/common/external-link'
import { useId, useState } from 'react'

import { AiFailureNotice } from '@/components/common/ai-failure-notice'
import type { AiFailure } from '@/lib/ai/failure'
import {
  PROVIDER_PROFILES,
  defaultModelFor,
  detectProviderKind,
  providerProfile,
} from '@/lib/ai/provider-catalog'
import { getProviderAdapter } from '@/lib/ai/providers'
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
import { cn } from '@/lib/utils'
import type { ProviderInput } from '@/stores/ai-store'
import type { AiProviderConfig, AiProviderKind } from '@/types'

interface ProviderFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  provider?: AiProviderConfig
  onSubmit: (input: ProviderInput) => Promise<void>
}

function formFromProvider(provider?: AiProviderConfig): ProviderInput {
  return {
    kind: provider?.kind ?? 'openrouter',
    label: provider?.label ?? '',
    apiKey: provider?.apiKey ?? '',
    baseUrl: provider?.baseUrl ?? null,
    defaultModel: provider?.defaultModel ?? null,
  }
}

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; model: string }
  | { status: 'failed'; failure: AiFailure }

const CUSTOM_MODEL = '__custom__'

/**
 * Bringing your own key.
 *
 * The form this replaces asked four questions in a row — which service, what
 * label, what base URL, which model — of somebody whose actual situation is
 * "I have a key in my clipboard and I want to talk to my character". Three of
 * those four can be worked out from the key itself, so now they are: paste
 * first, and everything else arrives already filled in and correctable.
 */
export function ProviderFormDialog({ open, onOpenChange, provider, onSubmit }: ProviderFormDialogProps) {
  const [test, setTest] = useState<TestState>({ status: 'idle' })

  const titleId = useId()
  const [form, setForm] = useState<ProviderInput>(() => formFromProvider(provider))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customModel, setCustomModel] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const profile = providerProfile(form.kind)
  const model = form.defaultModel?.trim() || defaultModelFor(form.kind)
  const modelIsListed = profile.models.includes(model)

  /** A pasted key names its own service, so nobody has to be asked. */
  function handleKeyChange(apiKey: string) {
    const detected = detectProviderKind(apiKey)
    setForm((current) => {
      if (!detected || detected === current.kind) return { ...current, apiKey }
      return {
        ...current,
        apiKey,
        kind: detected,
        // Only replace a model the writer did not choose themselves; a model
        // from the wrong service would fail on the first message instead.
        defaultModel: providerProfile(current.kind).models.includes(current.defaultModel?.trim() ?? '')
          ? defaultModelFor(detected)
          : current.defaultModel,
      }
    })
    setCustomModel(false)
    setTest({ status: 'idle' })
    if (error) setError(null)
  }

  function chooseKind(kind: AiProviderKind) {
    setForm((current) => ({
      ...current,
      kind,
      defaultModel: providerProfile(current.kind).models.includes(current.defaultModel?.trim() ?? '')
        ? defaultModelFor(kind)
        : current.defaultModel,
    }))
    setCustomModel(false)
    setTest({ status: 'idle' })
  }

  /**
   * One tiny request, now, rather than a failure in the middle of a scene.
   *
   * A wrong key used to be discovered when a writer was mid-sentence and
   * expecting prose. Testing here costs a single token and turns that into a
   * sentence about a key, at the moment they are already thinking about keys.
   */
  async function handleTest() {
    setTest({ status: 'testing' })
    const adapter = getProviderAdapter(form.kind)
    const result = await adapter.validateKey(
      {
        ...form,
        id: provider?.id ?? 'unsaved',
        createdAt: 0,
        updatedAt: 0,
        label: form.label.trim() || profile.label,
        baseUrl: form.baseUrl?.trim() || null,
        defaultModel: model,
      } as AiProviderConfig,
      model,
    )
    setTest(result.ok ? { status: 'ok', model } : { status: 'failed', failure: result.failure })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.apiKey.trim()) {
      setError('Paste your key here to continue.')
      return
    }
    if (profile.needsBaseUrl && !form.baseUrl?.trim()) {
      setError('This one needs an address — where is the model running?')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        ...form,
        label: form.label.trim() || profile.label,
        baseUrl: form.baseUrl?.trim() || null,
        // Saved rather than left blank, so the chat has a model to use
        // without the writer having to visit a second screen.
        defaultModel: model || null,
      })
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{provider ? 'Edit this connection' : 'Connect an AI'}</DialogTitle>
            <DialogDescription>
              Paste a key from any of these services. It stays on this device and is sent only to
              the service it belongs to.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor={`${titleId}-key`}>Your key</Label>
              <Input
                id={`${titleId}-key`}
                type="password"
                autoComplete="off"
                autoFocus
                value={form.apiKey}
                onChange={(e) => handleKeyChange(e.target.value)}
                placeholder="Paste it here — sk-…"
                aria-invalid={error ? true : undefined}
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <div className="grid gap-1.5">
              <Label>Service</Label>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {PROVIDER_PROFILES.map((option) => {
                  const active = option.kind === form.kind
                  return (
                    <button
                      key={option.kind}
                      type="button"
                      onClick={() => chooseKind(option.kind)}
                      aria-pressed={active}
                      className={cn(
                        'rounded-lg border p-2.5 text-left transition-colors',
                        active
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border hover:bg-accent',
                      )}
                    >
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                        {option.note}
                      </span>
                    </button>
                  )
                })}
              </div>
              {profile.keyUrl && (
                <ExternalLink
                  href={profile.keyUrl}
                  className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  Get a key from {profile.label} <ExternalLinkIcon className="size-3" />
                </ExternalLink>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={`${titleId}-model`}>Model</Label>
              {profile.models.length > 0 && !customModel ? (
                <Select
                  value={modelIsListed ? model : CUSTOM_MODEL}
                  onValueChange={(v) => {
                    if (v === CUSTOM_MODEL) {
                      setCustomModel(true)
                      return
                    }
                    setForm({ ...form, defaultModel: v })
                    setTest({ status: 'idle' })
                  }}
                >
                  <SelectTrigger id={`${titleId}-model`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {profile.models.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_MODEL}>Something else…</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`${titleId}-model`}
                  value={form.defaultModel ?? ''}
                  onChange={(e) => setForm({ ...form, defaultModel: e.target.value })}
                  placeholder={profile.models[0] ?? 'The model name your service uses'}
                />
              )}
              <p className="text-xs text-muted-foreground">
                You can change this any time, and each AI preset can use a different one.
              </p>
            </div>

            {(profile.needsBaseUrl || showAdvanced) && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${titleId}-base-url`}>
                    Address {!profile.needsBaseUrl && <span className="text-muted-foreground">(optional)</span>}
                  </Label>
                  <Input
                    id={`${titleId}-base-url`}
                    value={form.baseUrl ?? ''}
                    onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                    placeholder={profile.baseUrlPlaceholder ?? 'Leave empty for the usual one'}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${titleId}-label`}>Name this connection</Label>
                  <Input
                    id={`${titleId}-label`}
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder={profile.label}
                  />
                </div>
              </>
            )}

            {!profile.needsBaseUrl && !showAdvanced && (
              <button
                type="button"
                onClick={() => setShowAdvanced(true)}
                className="w-fit text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Advanced — custom address, or a name for this connection
              </button>
            )}
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!form.apiKey.trim() || test.status === 'testing'}
                onClick={handleTest}
              >
                {test.status === 'testing' ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <PlugZap className="size-3.5" />
                )}
                {test.status === 'testing' ? 'Checking…' : 'Check it works'}
              </Button>
              {test.status === 'ok' && (
                <p className="flex items-center gap-1.5 text-xs text-success">
                  <Check className="size-3.5" /> Working — {test.model} answered.
                </p>
              )}
            </div>
            {test.status === 'failed' && <AiFailureNotice failure={test.failure} onRetry={handleTest} />}
            <p className="text-xs text-muted-foreground">
              Your key is stored on this device only. It is never sent anywhere but the service it
              belongs to, and it is deliberately left out of backups and cloud sync.
            </p>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : provider ? 'Save changes' : 'Connect'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
