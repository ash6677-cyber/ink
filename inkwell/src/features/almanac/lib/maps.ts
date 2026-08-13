import type { MapPin, Scene } from '@/types'

/**
 * Map arithmetic. Pins live in normalized image coordinates (0..1 both
 * ways) so the same pin lands on the same mountain at every zoom, every
 * window size, and every export of the same image. Everything here is
 * geometry and counting; the Atlas view just draws it.
 */

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** A click inside the (possibly transformed) image, as normalized coords.
 * getBoundingClientRect already reflects any pan/zoom transform, so the
 * ratio is correct at every zoom level. */
export function normalizedPoint(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  }
}

/** How many scenes take place at each pin's entry — the "what happens
 * here" number. Pins with no entry, and entries no scene names, count 0. */
export function scenesByPin(pins: MapPin[], scenes: Pick<Scene, 'locationCodexId'>[]): Map<string, number> {
  const byEntry = new Map<string, number>()
  for (const scene of scenes) {
    if (!scene.locationCodexId) continue
    byEntry.set(scene.locationCodexId, (byEntry.get(scene.locationCodexId) ?? 0) + 1)
  }
  const counts = new Map<string, number>()
  for (const pin of pins) {
    counts.set(pin.id, pin.entryId ? (byEntry.get(pin.entryId) ?? 0) : 0)
  }
  return counts
}

/** The pin's display name: its label, its entry's name, or a plain mark. */
export function pinTitle(pin: MapPin, entryName: string | undefined, sceneCount: number): string {
  const name = pin.label.trim() || entryName || 'Unnamed pin'
  if (sceneCount === 0) return name
  return `${name} · ${sceneCount} ${sceneCount === 1 ? 'scene' : 'scenes'} here`
}

/** Zoom stepped by wheel, clamped to sane magnifications. */
export function nextZoom(current: number, deltaY: number): number {
  const factor = deltaY < 0 ? 1.2 : 1 / 1.2
  return Math.min(5, Math.max(1, current * factor))
}
