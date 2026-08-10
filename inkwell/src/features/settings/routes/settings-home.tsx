import { AI_FEATURE_LABEL, AI_KEYED_FEATURE_LABEL, presetForFeature, type AiFeature, type AiKeyedFeature } from '@/lib/ai/feature-preset'
import { isImageCapable } from '@/lib/ai/cover-concept'
import { usePreferencesStore } from '@/stores/preferences-store'
import {
  CheckCircle2,
  Database,
  Keyboard,
  Loader2,
  MoreHorizontal,
  Palette,
  Plus,
  Sparkles,
  User,
  XCircle,
  Search,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import { AccountSettings } from '@/features/auth/components/account-settings'
import { AppearanceSettings } from '@/features/settings/components/appearance-settings'
import { DataSettings } from '@/features/settings/components/data-settings'
import { PresetFormDialog } from '@/features/settings/components/preset-form-dialog'
import { ProviderFormDialog } from '@/features/settings/components/provider-form-dialog'
import { ShortcutsSettings } from '@/features/settings/components/shortcuts-settings'
import { maskApiKey } from '@/features/settings/lib/mask-key'
import { useAiStore, type PresetInput, type ProviderInput } from '@/stores/ai-store'
import type { AiPreset, AiProviderConfig } from '@/types'
import { useDocumentTitle } from '@/lib/hooks/use-document-title'

const PROVIDER_KIND_LABEL: Record<AiProviderConfig['kind'], string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  'openai-compatible': 'OpenAI-compatible',
}

const TABS = ['ai', 'appearance', 'shortcuts', 'data', 'account'] as const

/**
 * The searchable map of Settings: label → tab (and, where a control has an
 * anchor, the element to scroll to). Flat and hand-kept on purpose — the
 * cost of a new line per setting is what buys "type autosave, land on it".
 */
const SETTINGS_INDEX: { label: string; tab: string; anchor?: string }[] = [
  { label: 'AI providers', tab: 'ai' },
  { label: 'AI presets', tab: 'ai' },
  { label: 'Preset per feature (chat, editor, Book Creator)', tab: 'ai', anchor: 'setting-feature-presets' },
  { label: 'Manuscript typeface', tab: 'appearance' },
  { label: 'Focus mode · typewriter scrolling', tab: 'appearance' },
  { label: 'Focus mode · dim other paragraphs', tab: 'appearance' },
  { label: 'Autosave delay', tab: 'appearance', anchor: 'setting-autosave' },
  { label: 'Theme & colours', tab: 'appearance' },
  { label: 'Keyboard shortcuts', tab: 'shortcuts' },
  { label: 'Export or import your library', tab: 'data' },
  { label: 'Storage health', tab: 'data' },
  { label: 'Recently deleted (trash)', tab: 'data' },
  { label: 'Account & sign-in', tab: 'account' },
]

export function SettingsHome() {
  const [settingsQuery, setSettingsQuery] = useState('')
  function jumpToSetting(item: { tab: string; anchor?: string }) {
    setSettingsQuery('')
    selectTab(item.tab)
    if (item.anchor) {
      // The panel mounts with the tab switch; scroll on the next frame.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const el = document.getElementById(item.anchor!)
          el?.scrollIntoView({ block: 'center' })
          el?.classList.add('ring-2', 'ring-ring', 'rounded-md')
          setTimeout(() => el?.classList.remove('ring-2', 'ring-ring', 'rounded-md'), 1600)
        }),
      )
    }
  }

  useDocumentTitle('Settings')
  const { providers, presets, loadAll, createProvider, updateProvider, deleteProvider, validateProvider, createPreset, updatePreset, deletePreset } =
    useAiStore()
  const { toast } = useToast()

  // The active tab lives in the URL so other parts of the app — the command
  // palette, the native menu — can link straight to a section, and so a
  // reload keeps you where you were.
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab')
  const tab = TABS.includes(requested as (typeof TABS)[number]) ? requested! : 'ai'

  function selectTab(next: string) {
    setSearchParams(next === 'ai' ? {} : { tab: next }, { replace: true })
  }

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const [providerFormOpen, setProviderFormOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<AiProviderConfig | undefined>(undefined)
  const [providerFormKey, setProviderFormKey] = useState(0)
  const [deletingProvider, setDeletingProvider] = useState<AiProviderConfig | null>(null)
  const [validating, setValidating] = useState<string | null>(null)
  const [validationResult, setValidationResult] = useState<Record<string, 'ok' | 'error'>>({})

  const featurePresets = usePreferencesStore((s) => s.featurePresets)
  const setFeaturePreset = usePreferencesStore((s) => s.setFeaturePreset)
  const featureProviders = usePreferencesStore((s) => s.featureProviders)
  const setFeatureProvider = usePreferencesStore((s) => s.setFeatureProvider)
  const [presetFormOpen, setPresetFormOpen] = useState(false)
  const [editingPreset, setEditingPreset] = useState<AiPreset | undefined>(undefined)
  const [presetFormKey, setPresetFormKey] = useState(0)
  const [deletingPreset, setDeletingPreset] = useState<AiPreset | null>(null)

  function openCreateProvider() {
    setEditingProvider(undefined)
    setProviderFormKey((k) => k + 1)
    setProviderFormOpen(true)
  }
  function openEditProvider(provider: AiProviderConfig) {
    setEditingProvider(provider)
    setProviderFormKey((k) => k + 1)
    setProviderFormOpen(true)
  }

  async function handleProviderSubmit(input: ProviderInput) {
    if (editingProvider) {
      await updateProvider(editingProvider.id, input)
      toast({ title: 'Provider updated' })
    } else {
      await createProvider(input)
      toast({ title: 'Provider added' })
    }
  }

  async function handleValidate(provider: AiProviderConfig) {
    setValidating(provider.id)
    const result = await validateProvider(provider.id)
    setValidating(null)
    setValidationResult((prev) => ({ ...prev, [provider.id]: result.ok ? 'ok' : 'error' }))
    if (!result.ok) {
      toast({ title: 'Key validation failed', description: result.error, variant: 'destructive' })
    } else {
      toast({ title: 'Key looks good' })
    }
  }

  function openCreatePreset() {
    setEditingPreset(undefined)
    setPresetFormKey((k) => k + 1)
    setPresetFormOpen(true)
  }
  function openEditPreset(preset: AiPreset) {
    setEditingPreset(preset)
    setPresetFormKey((k) => k + 1)
    setPresetFormOpen(true)
  }

  async function handlePresetSubmit(input: PresetInput) {
    if (editingPreset) {
      await updatePreset(editingPreset.id, input)
      toast({ title: 'Preset updated' })
    } else {
      await createPreset(input)
      toast({ title: 'Preset created' })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Settings" />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="relative mb-4 max-w-3xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={settingsQuery}
            onChange={(e) => setSettingsQuery(e.target.value)}
            placeholder="Search settings…"
            aria-label="Search settings"
            className="pl-9"
          />
          {settingsQuery.trim() && (
            <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-card p-1 shadow-md">
              {SETTINGS_INDEX.filter((i) =>
                i.label.toLowerCase().includes(settingsQuery.trim().toLowerCase()),
              ).map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => jumpToSetting(item)}
                  className="flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-sm hover:bg-accent pointer-coarse:min-h-11"
                >
                  {item.label}
                  <span className="text-xs capitalize text-muted-foreground">{item.tab}</span>
                </button>
              ))}
              {SETTINGS_INDEX.every(
                (i) => !i.label.toLowerCase().includes(settingsQuery.trim().toLowerCase()),
              ) && <p className="px-2.5 py-2 text-sm text-muted-foreground">Nothing matches.</p>}
            </div>
          )}
        </div>
        <Tabs value={tab} onValueChange={selectTab} className="max-w-3xl">
          <TabsList className="-mx-4 max-w-[calc(100%+2rem)] overflow-x-auto px-4 sm:mx-0 sm:max-w-full sm:px-1">
            <TabsTrigger value="ai" className="gap-1.5">
              <Sparkles className="size-3.5" /> AI
            </TabsTrigger>
            <TabsTrigger value="appearance" className="gap-1.5">
              <Palette className="size-3.5" /> Appearance
            </TabsTrigger>
            <TabsTrigger value="shortcuts" className="gap-1.5">
              <Keyboard className="size-3.5" /> Shortcuts
            </TabsTrigger>
            <TabsTrigger value="data" className="gap-1.5">
              <Database className="size-3.5" /> Data
            </TabsTrigger>
            <TabsTrigger value="account" className="gap-1.5">
              <User className="size-3.5" /> Account
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="space-y-8 pt-2">
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Providers</h2>
                  <p className="text-xs text-muted-foreground">
                    Bring your own key. Requests go straight from your browser to the provider you choose — never through our servers.
                  </p>
                </div>
                <Button size="sm" onClick={openCreateProvider}>
                  <Plus /> Add provider
                </Button>
              </div>

              {providers.length === 0 ? (
                <EmptyState
                  icon={Sparkles}
                  title="No providers yet"
                  description="Add OpenAI, Anthropic, OpenRouter, or a local OpenAI-compatible endpoint to enable AI actions."
                  action={
                    <Button onClick={openCreateProvider}>
                      <Plus /> Add provider
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-2">
                  {providers.map((provider) => (
                    <Card
                      key={provider.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{provider.label}</p>
                          <Badge variant="outline" className="text-[10px]">
                            {PROVIDER_KIND_LABEL[provider.kind]}
                          </Badge>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {maskApiKey(provider.apiKey)}
                          {provider.defaultModel && ` · ${provider.defaultModel}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {validationResult[provider.id] === 'ok' && (
                          <CheckCircle2 className="size-4 text-success" />
                        )}
                        {validationResult[provider.id] === 'error' && (
                          <XCircle className="size-4 text-destructive" />
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={validating === provider.id}
                          onClick={() => handleValidate(provider)}
                        >
                          {validating === provider.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            'Validate'
                          )}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-7" aria-label={`More actions for ${provider.label}`}>
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditProvider(provider)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeletingProvider(provider)}
                              className="text-destructive focus:text-destructive"
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Presets</h2>
                  <p className="text-xs text-muted-foreground">
                    Choose a preset per AI action — model, temperature, and instructions bundled together.
                  </p>
                </div>
                <Button size="sm" onClick={openCreatePreset}>
                  <Plus /> New preset
                </Button>
              </div>

              <div className="space-y-2">
                {presets.map((preset) => {
                  const provider = providers.find((p) => p.id === preset.providerId)
                  return (
                    <Card
                      key={preset.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{preset.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {provider ? provider.label : 'No provider selected'}
                          {preset.model && ` · ${preset.model}`} · temp {preset.temperature}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openEditPreset(preset)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:text-destructive"
                          aria-label={`Delete ${preset.name}`}
                          onClick={() => setDeletingPreset(preset)}
                        >
                          <XCircle className="size-3.5" />
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>

              {presets.length > 0 && (
                <div id="setting-feature-presets" className="mt-6 space-y-3 border-t border-border pt-5">
                  <div>
                    <h3 className="text-sm font-semibold">Which preset each feature starts from</h3>
                    <p className="text-xs text-muted-foreground">
                      Chat can run warmer than outline generation. Anything left on the global
                      default follows whichever preset is starred.
                    </p>
                  </div>
                  {(['editorActions', 'chat', 'bookCreator', 'proofread', 'continuity'] as AiFeature[]).map((feature) => (
                    <div key={feature} className="flex items-center justify-between gap-3">
                      <span className="text-sm">{AI_FEATURE_LABEL[feature]}</span>
                      <Select
                        value={featurePresets[feature] ?? 'global'}
                        onValueChange={(v) => setFeaturePreset(feature, v === 'global' ? null : v)}
                      >
                        <SelectTrigger
                          className="w-56"
                          aria-label={`Preset for ${AI_FEATURE_LABEL[feature]}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="global">
                            Global default ({presetForFeature(presets, feature, {})?.name ?? 'none'})
                          </SelectItem>
                          {presets.map((preset) => (
                            <SelectItem key={preset.id} value={preset.id}>
                              {preset.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}

              {providers.length > 0 && (
                <div id="setting-feature-keys" className="mt-6 space-y-3 border-t border-border pt-5">
                  <div>
                    <h3 className="text-sm font-semibold">Which key runs each feature</h3>
                    <p className="text-xs text-muted-foreground">
                      Every request goes to the provider you pick here, billed on that key,
                      answered by that provider's model. Automatic follows the feature's
                      preset, then the first working key. Cover concepts only lists keys
                      whose API family can generate images.
                    </p>
                  </div>
                  {(
                    [
                      'editorActions',
                      'chat',
                      'bookCreator',
                      'proofread',
                      'continuity',
                      'coverConcepts',
                    ] as AiKeyedFeature[]
                  ).map((feature) => {
                    const options =
                      feature === 'coverConcepts' ? providers.filter(isImageCapable) : providers
                    return (
                      <div key={feature} className="flex items-center justify-between gap-3">
                        <span className="text-sm">{AI_KEYED_FEATURE_LABEL[feature]}</span>
                        <Select
                          value={featureProviders[feature] ?? 'auto'}
                          onValueChange={(v) => setFeatureProvider(feature, v === 'auto' ? null : v)}
                        >
                          <SelectTrigger
                            className="w-56"
                            aria-label={`Key for ${AI_KEYED_FEATURE_LABEL[feature]}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Automatic</SelectItem>
                            {options.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.label}
                              </SelectItem>
                            ))}
                            {options.length === 0 && (
                              <SelectItem value="none" disabled>
                                No image-capable keys yet
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="appearance" className="pt-2">
            <AppearanceSettings />
          </TabsContent>

          <TabsContent value="shortcuts" className="pt-2">
            <ShortcutsSettings />
          </TabsContent>

          <TabsContent value="data" className="pt-2">
            <DataSettings />
          </TabsContent>

          <TabsContent value="account" className="pt-2">
            <AccountSettings />
          </TabsContent>
        </Tabs>
      </div>

      <ProviderFormDialog
        key={`provider-${providerFormKey}`}
        open={providerFormOpen}
        onOpenChange={setProviderFormOpen}
        provider={editingProvider}
        onSubmit={handleProviderSubmit}
      />
      <PresetFormDialog
        key={`preset-${presetFormKey}`}
        open={presetFormOpen}
        onOpenChange={setPresetFormOpen}
        preset={editingPreset}
        providers={providers}
        onSubmit={handlePresetSubmit}
      />

      <ConfirmDeleteDialog
        open={deletingProvider !== null}
        onOpenChange={(open) => !open && setDeletingProvider(null)}
        title={`Remove "${deletingProvider?.label}"?`}
        description="Presets using this provider will need a new one selected before they can run."
        confirmLabel="Remove"
        pendingLabel="Removing…"
        onConfirm={async () => {
          if (deletingProvider) {
            await deleteProvider(deletingProvider.id)
            toast({ title: 'Provider removed' })
            setDeletingProvider(null)
          }
        }}
      />

      <ConfirmDeleteDialog
        open={deletingPreset !== null}
        onOpenChange={(open) => !open && setDeletingPreset(null)}
        title={`Delete "${deletingPreset?.name}"?`}
        description="This can't be undone."
        onConfirm={async () => {
          if (deletingPreset) {
            await deletePreset(deletingPreset.id)
            toast({ title: 'Preset deleted' })
            setDeletingPreset(null)
          }
        }}
      />
    </div>
  )
}
