/**
 * The card face as a picture — a canvas twin of `CardFace`, the same way
 * `render-cover.ts` twins the cover preview.
 *
 * A twin, not a screenshot: the DOM face is CSS custom properties and
 * animated finishes, and a still export is by definition an interpretation
 * of a moving thing. What must match is what makes the card recognisable —
 * proportions, the portrait's crop, the accent, the vignette, the name
 * block — and those are drawn here from the same numbers the CSS reads.
 */

import type { CardDesign, CropSettings } from '@/types'

import { accentFor, normalizeDesign } from './card-design'

export const CARD_PNG_WIDTH = 600
export const CARD_PNG_HEIGHT = 800 // the face's 3:4, at export scale
const RADIUS = 24

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** `object-fit: cover` with `object-position: x% y%` and a zoom, as math. */
function drawPortrait(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  crop: CropSettings | null,
  w: number,
  h: number,
) {
  const c = crop ?? { x: 50, y: 50, zoom: 1 }
  const cover = Math.max(w / image.width, h / image.height) * c.zoom
  const drawW = image.width * cover
  const drawH = image.height * cover
  const x = (w - drawW) * (c.x / 100)
  const y = (h - drawH) * (c.y / 100)
  ctx.drawImage(image, x, y, drawW, drawH)
}

export interface RenderCardFaceInput {
  name: string
  design: CardDesign | undefined
  tags: string[]
  image: HTMLImageElement | null
  crop: CropSettings | null
}

export function renderCardFaceToCanvas(
  canvas: HTMLCanvasElement,
  { name, design, tags, image, crop }: RenderCardFaceInput,
): void {
  const w = (canvas.width = CARD_PNG_WIDTH)
  const h = (canvas.height = CARD_PNG_HEIGHT)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable.')
  const d = normalizeDesign(design)
  const accent = accentFor(design, name)

  roundedRect(ctx, 0, 0, w, h, RADIUS)
  ctx.clip()

  // Ground: near-black, so the vignette has something to agree with.
  ctx.fillStyle = 'oklch(16% 0.01 260)'
  ctx.fillRect(0, 0, w, h)

  if (image) {
    drawPortrait(ctx, image, crop, w, h)
  } else {
    // The undrawn-character treatment: the accent, faintly, from the top
    // corner — same intent as the CSS gradient behind the placeholder.
    const wash = ctx.createLinearGradient(0, 0, w * 0.7, h * 0.9)
    wash.addColorStop(0, accent)
    wash.addColorStop(1, 'transparent')
    ctx.globalAlpha = 0.22
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1
  }

  // The vignette, with the CSS gradient's own stops.
  const v = d.vignette
  const vignette = ctx.createLinearGradient(0, h, 0, 0)
  vignette.addColorStop(0, `oklch(0% 0 0 / ${0.92 * v})`)
  vignette.addColorStop(0.22, `oklch(0% 0 0 / ${0.55 * v})`)
  vignette.addColorStop(0.52, 'transparent')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, w, h)

  // A still finish: one diagonal sheet of light, its strength the gloss
  // dial. Foil and holo shimmer in motion; a print of them is this.
  if (d.finish !== 'matte') {
    const shine = ctx.createLinearGradient(0, 0, w, h * 0.8)
    shine.addColorStop(0.25, 'transparent')
    shine.addColorStop(0.5, `oklch(98% 0.02 260 / ${0.16 * d.gloss})`)
    shine.addColorStop(0.62, 'transparent')
    ctx.fillStyle = shine
    ctx.fillRect(0, 0, w, h)
  }

  // The frame: an accent-tinted inner border. The five frames differ in
  // chrome the CSS carves with masks; at export size what identifies a
  // framed card is the accent line itself, so plain omits it and the rest
  // carry it (plate doubles the footer rule below instead of a box).
  if (d.frame !== 'plain' && d.frame !== 'plate') {
    ctx.save()
    ctx.strokeStyle = accent
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 3
    roundedRect(ctx, 10, 10, w - 20, h - 20, RADIUS - 8)
    ctx.stroke()
    ctx.restore()
  }

  // The footer block: name, accent rule, tags.
  const footerY = h - 150
  ctx.fillStyle = 'oklch(97% 0.005 260)'
  ctx.font = '600 44px "Source Serif 4", Georgia, serif'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(fitText(ctx, name, w - 64), 32, footerY + 52)

  ctx.fillStyle = accent
  ctx.globalAlpha = d.frame === 'plate' ? 1 : 0.9
  ctx.fillRect(32, footerY + 72, d.frame === 'plate' ? w - 64 : 56, 3)
  ctx.globalAlpha = 1

  ctx.font = '500 20px Inter, system-ui, sans-serif'
  let tagX = 32
  for (const tag of tags.slice(0, 3)) {
    const label = tag.length > 18 ? `${tag.slice(0, 17)}…` : tag
    const width = ctx.measureText(label).width + 28
    if (tagX + width > w - 32) break
    ctx.fillStyle = 'oklch(30% 0.02 260 / 0.85)'
    roundedRect(ctx, tagX, footerY + 92, width, 34, 17)
    ctx.fill()
    ctx.fillStyle = 'oklch(90% 0.01 260)'
    ctx.fillText(label, tagX + 14, footerY + 116)
    tagX += width + 10
  }
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}
