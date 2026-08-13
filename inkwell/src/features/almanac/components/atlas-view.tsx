import { Map as MapIcon, MapPin as MapPinIcon, Plus, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { EmptyState } from '@/components/common/empty-state'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { nextZoom, normalizedPoint, pinTitle, scenesByPin } from '@/features/almanac/lib/maps'
import { storeImageFile } from '@/lib/image-upload'
import { imageAssetRepo, sceneRepo, worldMapRepo } from '@/lib/db/repositories'
import { cn } from '@/lib/utils'
import type { CodexEntry, Scene, WorldMap } from '@/types'

/**
 * The Atlas: the writer's own map images, pinned to Almanac entries.
 * Wheel zooms, drag pans, "Drop pin" arms a click-to-place; pins are kept
 * in normalized image coordinates so they stay on their mountain at every
 * zoom. Scenes that name a pinned location plot themselves on as counts.
 * Entirely local — the image is an ordinary imageAssets blob.
 */
export function AtlasView({
  projectId,
  entries,
}: {
  projectId: string
  entries: CodexEntry[]
}) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [maps, setMaps] = useState<WorldMap[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [scenes, setScenes] = useState<Pick<Scene, 'locationCodexId'>[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [allMaps, allScenes] = await Promise.all([worldMapRepo.list(), sceneRepo.list()])
      if (cancelled) return
      const mine = allMaps
        .filter((m) => m.projectId === projectId)
        .sort((a, b) => a.createdAt - b.createdAt)
      setMaps(mine)
      setScenes(allScenes.filter((s) => s.projectId === projectId))
      setActiveId((current) => current ?? mine[0]?.id ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const active = maps?.find((m) => m.id === activeId) ?? null

  // The map image as an object URL, revoked when it changes.
  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    void (async () => {
      if (!active) {
        setImageUrl(null)
        return
      }
      const asset = await imageAssetRepo.get(active.imageId)
      if (cancelled || !asset) return
      url = URL.createObjectURL(asset.blob)
      setImageUrl(url)
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [active])

  // ---- Pan & zoom, plain CSS transform state. ----
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragging = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const movedRef = useRef(false)

  // ---- Pin placement. ----
  const [arming, setArming] = useState(false)
  const [pinEntryId, setPinEntryId] = useState('')
  const entryName = useMemo(() => new Map(entries.map((e) => [e.id, e.name])), [entries])
  const sceneCounts = useMemo(
    () => (active ? scenesByPin(active.pins, scenes) : new Map<string, number>()),
    [active, scenes],
  )

  async function persistPins(map: WorldMap, pins: WorldMap['pins']) {
    await worldMapRepo.update(map.id, { pins })
    setMaps((all) => (all ?? []).map((m) => (m.id === map.id ? { ...m, pins } : m)))
  }

  async function handleUpload(file: File | undefined) {
    if (!file) return
    const asset = await storeImageFile(file)
    const name = file.name.replace(/\.[a-z0-9]+$/i, '') || 'Untitled map'
    const created = await worldMapRepo.create({ projectId, name, imageId: asset.id, pins: [] })
    setMaps((all) => [...(all ?? []), created])
    setActiveId(created.id)
    setZoom(1)
    setPan({ x: 0, y: 0 })
    toast({ title: `“${name}” added to the Atlas`, description: 'Arm “Drop pin” and click the map to mark places.' })
  }

  function handleMapClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!active || !arming || movedRef.current) return
    const point = normalizedPoint(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY)
    const entryId = pinEntryId || null
    void persistPins(active, [
      ...active.pins,
      {
        id: `pin-${Math.random().toString(36).slice(2, 10)}`,
        x: point.x,
        y: point.y,
        entryId,
        label: '',
      },
    ])
    setArming(false)
  }

  if (maps === null) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
  }

  if (maps.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void handleUpload(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <EmptyState
          icon={MapIcon}
          title="No maps yet"
          description="Bring your own world: upload a drawn, scanned or generated map image, then pin your Almanac's places onto it. Everything stays on your device."
          action={
            <Button onClick={() => fileRef.current?.click()}>
              <Upload /> Add a map image
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4 sm:p-6" data-atlas>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleUpload(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {/* ---- Toolbar. ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={activeId ?? ''} onValueChange={(id) => { setActiveId(id); setZoom(1); setPan({ x: 0, y: 0 }) }}>
          <SelectTrigger className="w-48" aria-label="Which map">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {maps.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <Plus /> New map
        </Button>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        <Select value={pinEntryId || 'plain'} onValueChange={(v) => setPinEntryId(v === 'plain' ? '' : v)}>
          <SelectTrigger className="w-48" aria-label="Entry for the next pin">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="plain">A plain marker</SelectItem>
            {entries.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={arming ? 'default' : 'outline'}
          onClick={() => setArming((v) => !v)}
          aria-pressed={arming}
        >
          <MapPinIcon /> {arming ? 'Click the map…' : 'Drop pin'}
        </Button>

        {active && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-muted-foreground hover:text-destructive"
            aria-label={`Delete map ${active.name}`}
            onClick={() => {
              void worldMapRepo.remove(active.id).then(() => {
                setMaps((all) => (all ?? []).filter((m) => m.id !== active.id))
                setActiveId(null)
              })
            }}
          >
            <Trash2 className="size-3.5" /> Delete map
          </Button>
        )}
      </div>

      {/* ---- The map itself. ---- */}
      {active && (
        <div
          className={cn(
            'relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/30',
            arming ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing',
          )}
          onWheel={(e) => setZoom((z) => nextZoom(z, e.deltaY))}
          onPointerDown={(e) => {
            movedRef.current = false
            dragging.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
          }}
          onPointerMove={(e) => {
            const d = dragging.current
            if (!d) return
            const dx = e.clientX - d.startX
            const dy = e.clientY - d.startY
            if (Math.abs(dx) + Math.abs(dy) > 4) movedRef.current = true
            if (!arming) setPan({ x: d.panX + dx, y: d.panY + dy })
          }}
          onPointerUp={() => {
            dragging.current = null
          }}
          data-atlas-stage
        >
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center' }}
          >
            <div className="relative" onClick={handleMapClick} data-atlas-image>
              {imageUrl && (
                <img src={imageUrl} alt={active.name} className="max-h-full select-none" draggable={false} />
              )}
              {active.pins.map((pin) => {
                const count = sceneCounts.get(pin.id) ?? 0
                const title = pinTitle(pin, pin.entryId ? entryName.get(pin.entryId) : undefined, count)
                return (
                  <button
                    key={pin.id}
                    type="button"
                    title={title}
                    aria-label={title}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (pin.entryId) navigate(`/almanac/${pin.entryId}?project=${projectId}`)
                    }}
                    className="absolute -translate-x-1/2 -translate-y-full"
                    style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                  >
                    <span className="relative block">
                      <MapPinIcon className="size-5 fill-primary/80 text-primary-foreground drop-shadow" />
                      {count > 0 && (
                        <span className="absolute -right-2 -top-2 rounded-full bg-warning px-1 text-[9px] font-bold leading-4 text-warning-foreground">
                          {count}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ---- The pins, listed for hands and screen readers alike. ---- */}
      {active && active.pins.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" data-atlas-pins>
          {active.pins.map((pin) => {
            const count = sceneCounts.get(pin.id) ?? 0
            const name = pin.label.trim() || (pin.entryId ? entryName.get(pin.entryId) : '') || 'Unnamed pin'
            return (
              <li key={pin.id} className="flex items-center gap-1 rounded-full border border-border py-0.5 pl-2.5 pr-1 text-xs">
                <button
                  type="button"
                  className="hover:underline"
                  onClick={() => pin.entryId && navigate(`/almanac/${pin.entryId}?project=${projectId}`)}
                >
                  {name}
                  {count > 0 && <span className="text-muted-foreground"> · {count}</span>}
                </button>
                <button
                  type="button"
                  aria-label={`Remove pin ${name}`}
                  className="rounded-full p-0.5 text-muted-foreground hover:text-destructive"
                  onClick={() => void persistPins(active, active.pins.filter((p) => p.id !== pin.id))}
                >
                  <Trash2 className="size-3" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {active && active.pins.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Pick an entry (or a plain marker), arm <span className="font-medium">Drop pin</span>, and
          click the map. Scenes that name a pinned place show up as counts on its pin.
        </p>
      )}

    </div>
  )
}
