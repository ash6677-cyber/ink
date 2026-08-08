import { useLiveQuery } from 'dexie-react-hooks'
import {
  Check,
  Copy,
  Download,
  ImagePlus,
  Library,
  Loader2,
  Pencil,
  Plus,
  Redo2,
  RotateCw,
  Star,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/use-toast'
import { CoverPreview } from '@/features/covers/components/cover-preview'
import { MAX_ZOOM, MIN_ZOOM } from '@/features/covers/lib/crop-geometry'
import { coverDisplayName } from '@/features/covers/lib/resolve-cover'
import { TypographyLayerRow } from '@/features/covers/components/typography-layer-row'
import { ASPECT_DIMENSIONS } from '@/features/covers/lib/aspect'
import { exportCoverPng } from '@/features/covers/lib/render-cover'
import { imageAssetRepo } from '@/lib/db/repositories'
import { DEFAULT_EDITOR_FONT_ID } from '@/lib/editor/fonts'
import { useObjectUrl } from '@/lib/hooks/use-object-url'
import { storeImageFile } from '@/lib/image-upload'
import { cn } from '@/lib/utils'
import { useCoverStore } from '@/stores/cover-store'
import { useProjectStore } from '@/stores/project-store'
import type { CoverAspectPreset, CoverTypographyLayer } from '@/types'
import { useDocumentTitle } from '@/lib/hooks/use-document-title'

function newLayer(kind: CoverTypographyLayer['kind'], text: string): Omit<CoverTypographyLayer, 'id'> {
  const isTitle = kind === 'title'
  return {
    kind,
    text,
    fontFamily: DEFAULT_EDITOR_FONT_ID,
    fontSize: isTitle ? 9 : 4.5,
    fontWeight: isTitle ? 700 : 500,
    color: '#ffffff',
    letterSpacing: isTitle ? 2 : 8,
    align: 'center',
    x: 50,
    y: isTitle ? 42 : 88,
    shadow: true,
  }
}

export function CoversHome() {
  useDocumentTitle('Cover Studio')
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('project')
  const { toast } = useToast()

  const projects = useProjectStore((s) => s.projects)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const project = projects.find((p) => p.id === projectId)

  const {
    cover,
    variants,
    history,
    status,
    loadProject,
    setSourceImage,
    setAspectPreset,
    updateCrop,
    updateOverlay,
    addTypographyLayer,
    updateTypographyLayer,
    removeTypographyLayer,
    setExportedImage,
    selectVariant,
    createVariant,
    renameVariant,
    activateVariant,
    deleteVariant,
    undo,
    redo,
  } = useCoverStore()

  useEffect(() => {
    fetchProjects()
  }, [fetchProjects])
  useEffect(() => {
    if (projectId) loadProject(projectId)
  }, [projectId, loadProject])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
      const target = e.target as HTMLElement | null
      // Typing in a field has its own undo; the studio must not eat it.
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return
      e.preventDefault()
      void (e.shiftKey ? useCoverStore.getState().redo() : useCoverStore.getState().undo())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [pickingLayerId, setPickingLayerId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sourceImage = useLiveQuery(
    () => (cover?.sourceImageId ? imageAssetRepo.get(cover.sourceImageId) : Promise.resolve(undefined)),
    [cover?.sourceImageId],
  )
  const imageUrl = useObjectUrl(sourceImage?.blob)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Please choose an image file', variant: 'destructive' })
      return
    }
    setUploading(true)
    try {
      const asset = await storeImageFile(file)
      await setSourceImage(asset.id)
    } catch {
      toast({ title: 'Could not read that image', variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  async function handleExport() {
    if (!cover || !project) return
    setExporting(true)
    try {
      const blob = await exportCoverPng(cover, imageUrl)
      const asset = await imageAssetRepo.create({
        blob,
        mimeType: 'image/png',
        width: ASPECT_DIMENSIONS[cover.aspectPreset].w,
        height: ASPECT_DIMENSIONS[cover.aspectPreset].h,
        fileName: `${project.title || 'cover'}.png`,
      })
      await setExportedImage(asset.id)

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${project.title || 'cover'}.png`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: 'Cover exported', description: 'Saved to your device and set as the project cover.' })
    } catch {
      toast({ title: 'Could not export the cover', variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={Library}
          title="No project selected"
          description="Open a project from the Projects page to design its cover."
          action={
            <Button asChild>
              <Link to="/projects">Go to Projects</Link>
            </Button>
          }
        />
      </div>
    )
  }

  if (status === 'loading' || !cover || !project) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Cover Studio" />
        <div className="flex-1 p-6">
          <Skeleton className="mx-auto h-[32rem] max-w-md" />
        </div>
      </div>
    )
  }

  const selectedLayer = cover.typography.find((l) => l.id === selectedLayerId) ?? null
  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0

  // Which design the shelf shows. No flag anywhere means the newest row is
  // standing in, exactly as before variants existed.
  const activeId =
    variants.find((v) => v.active)?.id ??
    [...variants].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Cover Studio"
        description={project.title}
        actions={
          <>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => void undo()}
              disabled={!canUndo}
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => void redo()}
              disabled={!canRedo}
              aria-label="Redo"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="size-4" />
            </Button>
            <Button size="sm" onClick={handleExport} disabled={exporting} className="gap-1.5">
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Export PNG
            </Button>
          </>
        }
      />

      <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <div className="flex flex-1 items-start justify-center p-5 sm:p-8 lg:overflow-y-auto">
          <CoverPreview
            cover={cover}
            imageUrl={imageUrl}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
            onCommitLayerPosition={(id, x, y) => updateTypographyLayer(id, { x, y })}
            onCropChange={updateCrop}
            picking={pickingLayerId !== null}
            onPick={(hex) => {
              if (pickingLayerId) updateTypographyLayer(pickingLayerId, { color: hex })
              setPickingLayerId(null)
            }}
            className="w-full max-w-sm"
          />
        </div>

        <aside className="w-full shrink-0 space-y-5 overflow-y-auto border-t border-border p-4 sm:p-5 lg:w-80 lg:border-l lg:border-t-0">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Covers
              </Label>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => void createVariant()}
                >
                  <Plus className="size-3" /> New
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => void createVariant({ duplicate: true })}
                >
                  <Copy className="size-3" /> Duplicate
                </Button>
              </div>
            </div>
            {/* One book, several jackets. The starred one is what the shelf
                and the box set wear; the one open here is just being edited,
                which is why selecting and starring are different acts. */}
            <div className="space-y-1">
              {variants.map((variant, index) => {
                const isOpen = variant.id === cover.id
                const isActive = variant.id === activeId
                return (
                  <div
                    key={variant.id}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-2 py-1.5',
                      isOpen ? 'border-primary/50 bg-accent/30' : 'border-border',
                    )}
                  >
                    {renamingId === variant.id ? (
                      <form
                        className="flex min-w-0 flex-1 items-center gap-1"
                        onSubmit={(e: React.FormEvent) => {
                          e.preventDefault()
                          void renameVariant(variant.id, renameText)
                          setRenamingId(null)
                        }}
                      >
                        <Input
                          autoFocus
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          onBlur={() => {
                            void renameVariant(variant.id, renameText)
                            setRenamingId(null)
                          }}
                          className="h-6 pointer-coarse:h-11 text-xs"
                        />
                        <button type="submit" aria-label="Save name" className="touch-target text-primary">
                          <Check className="size-3.5" />
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => selectVariant(variant.id)}
                        className="min-w-0 flex-1 truncate text-left text-xs font-medium pointer-coarse:min-h-11"
                      >
                        {coverDisplayName(variant, index)}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void activateVariant(variant.id)}
                      aria-label={isActive ? 'This is the cover in use' : 'Use this cover'}
                      aria-pressed={isActive}
                      title={isActive ? 'The cover your book wears' : 'Use this cover'}
                      className={cn(
                        'touch-target shrink-0 rounded p-1',
                        isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Star className={cn('size-3.5', isActive && 'fill-current')} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(variant.id)
                        setRenameText(coverDisplayName(variant, index))
                      }}
                      aria-label="Rename this cover"
                      className="touch-target shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="size-3" />
                    </button>
                    {variants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => void deleteVariant(variant.id)}
                        aria-label="Delete this cover"
                        className="touch-target shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Source image
            </Label>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
              {imageUrl ? 'Replace image' : 'Upload image'}
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          </section>

          <section className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Aspect</Label>
            <Select value={cover.aspectPreset} onValueChange={(v: CoverAspectPreset) => setAspectPreset(v)}>
              <SelectTrigger aria-label="Cover aspect ratio">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ASPECT_DIMENSIONS).map(([key, dims]) => (
                  <SelectItem key={key} value={key}>
                    {dims.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {imageUrl && (
            <section className="space-y-3">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Frame image
              </Label>
              <p className="text-xs text-muted-foreground">
                Drag the picture to move it, or hold {'\u2318'}/Ctrl and scroll to zoom. The
                sliders do the same thing, for when you want it exact.
              </p>
              <div className="grid gap-1.5">
                <Label className="text-xs">Zoom</Label>
                <input
                  type="range"
                  aria-label="Image zoom"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.05}
                  value={cover.crop.zoom}
                  onChange={(e) => updateCrop({ zoom: Number(e.target.value) })}
                  className="accent-primary pointer-coarse:h-11"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Horizontal</Label>
                <input
                  type="range"
                  aria-label="Image horizontal position"
                  min={0}
                  max={100}
                  value={cover.crop.x}
                  onChange={(e) => updateCrop({ x: Number(e.target.value) })}
                  className="accent-primary pointer-coarse:h-11"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Vertical</Label>
                <input
                  type="range"
                  aria-label="Image vertical position"
                  min={0}
                  max={100}
                  value={cover.crop.y}
                  onChange={(e) => updateCrop({ y: Number(e.target.value) })}
                  className="accent-primary pointer-coarse:h-11"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="flex items-center gap-1 text-xs">
                  <RotateCw className="size-3" /> Rotation
                </Label>
                <input
                  type="range"
                  aria-label="Image rotation"
                  min={-45}
                  max={45}
                  value={cover.crop.rotation}
                  onChange={(e) => updateCrop({ rotation: Number(e.target.value) })}
                  className="accent-primary pointer-coarse:h-11"
                />
              </div>
            </section>
          )}

          <section className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Overlay
              </Label>
              <Switch
                aria-label="Toggle overlay"
                checked={cover.overlay.enabled}
                onCheckedChange={(v) => updateOverlay({ enabled: v })}
              />
            </div>
            {cover.overlay.enabled && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Color</Label>
                    <input
                      type="color"
                      aria-label="Overlay color"
                      value={cover.overlay.color}
                      onChange={(e) => updateOverlay({ color: e.target.value })}
                      className="h-9 pointer-coarse:h-11 w-full cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Direction</Label>
                    <Select
                      value={cover.overlay.direction}
                      onValueChange={(v: 'top' | 'bottom' | 'full') => updateOverlay({ direction: v })}
                    >
                      <SelectTrigger aria-label="Overlay direction">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom">Bottom fade</SelectItem>
                        <SelectItem value="top">Top fade</SelectItem>
                        <SelectItem value="full">Full tint</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Opacity — {Math.round(cover.overlay.opacity * 100)}%</Label>
                  <input
                    type="range"
                    aria-label="Overlay opacity"
                    min={0}
                    max={1}
                    step={0.05}
                    value={cover.overlay.opacity}
                    onChange={(e) => updateOverlay({ opacity: Number(e.target.value) })}
                    className="accent-primary pointer-coarse:h-11"
                  />
                </div>
              </>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Text layers
              </Label>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => addTypographyLayer(newLayer('title', project.title))}
                >
                  <Plus className="size-3" /> Title
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => addTypographyLayer(newLayer('author', project.author))}
                >
                  <Plus className="size-3" /> Author
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => addTypographyLayer(newLayer('custom', ''))}
                >
                  <Plus className="size-3" /> Text
                </Button>
              </div>
            </div>

            {cover.typography.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                Add a title, author, or custom text layer.
              </p>
            ) : (
              <div className="space-y-2">
                {cover.typography.map((layer) => (
                  <TypographyLayerRow
                    key={layer.id}
                    layer={layer}
                    expanded={selectedLayer?.id === layer.id}
                    onSelect={() => setSelectedLayerId((id) => (id === layer.id ? null : layer.id))}
                    onChange={(changes) => updateTypographyLayer(layer.id, changes)}
                    onPickColor={
                      imageUrl
                        ? () => setPickingLayerId((id) => (id === layer.id ? null : layer.id))
                        : undefined
                    }
                    picking={pickingLayerId === layer.id}
                    onDelete={() => {
                      removeTypographyLayer(layer.id)
                      if (selectedLayerId === layer.id) setSelectedLayerId(null)
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
