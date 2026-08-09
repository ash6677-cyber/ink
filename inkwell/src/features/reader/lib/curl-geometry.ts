/**
 * Geometry for a bending sheet of paper.
 *
 * The page is modelled as a chain of narrow segments hinged end to end.
 * Each segment's angle differs slightly from the last, so the segments
 * accumulate into an arc rather than a plane — that's what makes the page
 * actually bend instead of pivoting rigidly like a door.
 *
 * Two things fall out of this for free, both of which real paper does and a
 * flat rotation cannot:
 *
 *  - The sheet's *chord* is shorter than its arc length, because paper
 *    doesn't stretch. So as the page bows, its free edge pulls in toward
 *    the spine and then extends again as it flattens onto the other side.
 *  - Every segment faces a slightly different direction, so light across
 *    the page varies continuously instead of as one uniform tone.
 */

/**
 * WebKit — every browser on an iPhone, plus desktop Safari — mis-composites
 * the deep preserve-3d chain the bending sheet is built from: segments get
 * depth-sorted behind the static pages and the turn shows as an off-centre
 * flash that vanishes. Detected by engine, not platform, because iOS
 * Chrome and Firefox are WebKit too.
 */
const isWebKit =
  typeof navigator !== 'undefined' &&
  /AppleWebKit/i.test(navigator.userAgent) &&
  !/Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent)

/**
 * Segments across the sheet. Eighteen is where the arc stops looking
 * faceted without losing frame-time headroom — but on WebKit the sheet
 * degrades to ONE segment: the bend flattens into a clean single-plane
 * flip (same spring, same faces, same shading), which is the one 3D
 * pattern that engine composites reliably.
 */
export const SEGMENT_COUNT = isWebKit ? 1 : 18

/**
 * Total angle swept across the sheet at peak bend, in radians (~37°).
 *
 * Tuned down from a much larger value that curled the page into a tube: a
 * sheet held in the hand bows, it doesn't roll up, and an over-curled page
 * also swings far enough toward the viewer that perspective blows it up
 * past the covers.
 */
const MAX_BEND = 0.65

/**
 * How much of the bend is pushed toward the free edge. 1 would be an even arc.
 *
 * A page lifted at its outer corner does not bow as a uniform curve: the
 * half nearest the spine stays comparatively straight because it is pinned,
 * and the curvature tightens toward the edge being held. Distributing the
 * hinge angles along a curve rather than linearly is what separates paper
 * under tension from a bent tube.
 */
const EDGE_WEIGHT = 1.55

/**
 * Where the bend is greatest, as a fraction of the turn.
 *
 * Slightly before halfway: a page is at its most bowed while still being
 * lifted against the resistance of the spine, and has begun to straighten
 * by the time it falls past vertical.
 */
const PEAK_AT = 0.45

/**
 * How much the sheet narrows toward its free edge at peak curl.
 *
 * This is what stops the page looking like cardboard. Hinged about vertical
 * axes alone, the sheet wraps a cylinder: every horizontal slice bends
 * identically and the top and bottom edges stay parallel straight lines,
 * which the eye reads as a rigid board. Real paper lifted away from the
 * spine wraps a cone — the lifted part is foreshortened, so its edges
 * converge rather than running parallel.
 *
 * Tapering each segment vertically reproduces that convergence while
 * leaving the hinges vertical, so the chain of segments still closes
 * exactly. Tilting the hinge axes instead — the obvious way to build a
 * literal cone — splays the segments apart into a venetian blind, because
 * each one spans the full page height and the chain no longer meets.
 */
const MAX_TAPER = 0.13

export interface Segment {
  /** Offset from the spine, in px, of this segment's hinge. */
  x: number
  /** Depth of the hinge. Negative is toward the viewer. */
  z: number
  /** Segment angle in radians. */
  angle: number
  /** Vertical scale, below 1 where the sheet is foreshortened by the curl. */
  taper: number
  /** 0..1 shading for the front face — higher is darker. */
  frontShade: number
  /** 0..1 shading for the reverse. */
  backShade: number
  /** 0..1 sheen on the front face, where the bow catches the light. */
  frontSheen: number
  /** 0..1 sheen on the reverse. */
  backSheen: number
}

/**
 * Bend envelope over the turn: zero at both ends, peaking off-centre.
 *
 * Two half-cosines joined at the peak, so the rise and fall can have
 * different durations without a kink where they meet.
 */
function bendEnvelope(p: number): number {
  if (p <= 0 || p >= 1) return 0
  const t = p < PEAK_AT ? p / PEAK_AT : (1 - p) / (1 - PEAK_AT)
  return (1 - Math.cos(Math.PI * t)) / 2
}

/**
 * @param progress 0 = lying flat on the right, 1 = lying flat on the left.
 * @param width    Page width in px.
 * @param count    Number of segments. More is smoother and costlier.
 */
export function computeCurl(progress: number, width: number, count: number): Segment[] {
  const p = Math.max(0, Math.min(1, progress))
  // Mean rotation of the whole sheet: a straight sweep from right to left.
  const sweep = -Math.PI * p
  // A single segment cannot bend — it is the degraded flat-flip mode, and
  // half a bend angle baked into its one hinge would just skew the sheet.
  const bend = count === 1 ? 0 : -MAX_BEND * bendEnvelope(p)

  const segmentLength = width / count
  // Centre the bend on the mean angle so the sheet bows symmetrically about
  // its rotation rather than swinging its free edge ahead of the spine.
  const startAngle = sweep - bend / 2

  // Foreshortening tracks the bend: none when the page lies flat, most when
  // it is standing up and the curl is deepest.
  const maxTaper = MAX_TAPER * bendEnvelope(p)

  const segments: Segment[] = []
  let x = 0
  let z = 0

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1)
    // Curvature concentrated toward the free edge rather than spread evenly.
    const shaped = Math.pow(t, EDGE_WEIGHT)
    const angle = startAngle + bend * shaped
    // Narrowing toward the free edge, so the sheet's silhouette is a
    // trapezoid rather than a rectangle — the cue that reads as a cone.
    const taper = 1 - maxTaper * shaped

    // Lambert-ish term: 1 when the face is square to the reader, 0 edge-on.
    const facing = Math.cos(angle)
    const frontFacing = Math.max(0, facing)
    const backFacing = Math.max(0, -facing)

    // A narrow highlight near glancing angles, which is where a sheet of
    // paper actually catches the light. Without it the bow reads as flat
    // card however correct its geometry.
    const grazing = Math.abs(Math.sin(angle))
    const sheenBand = Math.pow(grazing, 6)

    segments.push({
      x,
      z,
      angle,
      taper,
      frontShade: clamp01((1 - frontFacing) * 0.46),
      backShade: clamp01((1 - backFacing) * 0.42),
      frontSheen: clamp01(sheenBand * frontFacing * 0.5),
      backSheen: clamp01(sheenBand * backFacing * 0.45),
    })

    // CSS rotateY(a) sends the local +x axis to (cos a, 0, -sin a), so the
    // hinge chain has to advance along that same vector to stay joined.
    x += segmentLength * Math.cos(angle)
    z += -segmentLength * Math.sin(angle)
  }

  return segments
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/**
 * How much wider than its slot a segment must be drawn to hide the seam.
 *
 * Neighbouring segments meet at an angle, so each one's projected width is
 * slightly less than its true width and a hairline of background shows
 * through. The shortfall grows with the angle between neighbours, so a
 * fixed overlap is too much when the sheet is flat and too little exactly
 * when the bend is at its worst.
 */
export function seamOverlap(segmentLength: number, count: number): number {
  // One segment has no seams to hide.
  if (count === 1) return 0
  // Kept as small as it can be. Segments carry a translucent shade, so
  // wherever two overlap the shade is painted twice and the seam shows as a
  // dark vertical stripe — with eighteen of them the sheet reads as fluted
  // card. A wide overlap hides hairline gaps at the cost of corrugating the
  // whole page, which is much the worse trade.
  const maxHingeAngle = (MAX_BEND * EDGE_WEIGHT) / Math.max(1, count - 1)
  return segmentLength * (1 - Math.cos(maxHingeAngle)) + 0.35
}

/** Straight-line distance from the spine to the sheet's free edge. Shorter
 * than the page width whenever the sheet is bowed. */
export function chordLength(segments: Segment[], width: number, count: number): number {
  const last = segments[segments.length - 1]
  if (!last) return width
  const segmentLength = width / count
  const endX = last.x + segmentLength * Math.cos(last.angle)
  const endZ = last.z + -segmentLength * Math.sin(last.angle)
  return Math.hypot(endX, endZ)
}
