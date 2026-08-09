import { forwardRef, useImperativeHandle, useMemo, useRef, type ReactNode } from 'react'

import { computeCurl, seamOverlap } from '@/features/reader/lib/curl-geometry'

export interface CurlHandle {
  setProgress: (progress: number) => void
}

interface CurlLeafProps {
  width: number
  height: number
  /** How many hinged segments to cut the sheet into. One means a flat flip. */
  count: number
  /**
   * Rotate the sheet about its own centre instead of the spine edge.
   *
   * A spine-edge pivot is right for a two-page spread — the sheet lands on
   * the facing page. On a single-page screen there IS no facing page, so a
   * spine pivot swings the entire second half of the turn off-screen: the
   * reader watches half a flip and then nothing. Centre pivot keeps every
   * frame of the turn on the page's own footprint.
   */
  centerPivot: boolean
  /** Recto — the face lying to the right of the spine at rest. */
  front: ReactNode
  /** Verso — the reverse, which comes to rest on the left. */
  back: ReactNode
}

/**
 * A page that genuinely bends.
 *
 * The sheet is cut into vertical segments, each a window onto the same page
 * content shifted sideways, and the segments are hinged end to end into an
 * arc. Because every segment carries its own angle, the surface is curved
 * rather than planar, and its shading varies continuously across the bow.
 *
 * The text inside stays live DOM the whole way through — the curve is built
 * out of real transforms rather than by rendering the page to a texture and
 * warping it, so nothing is resampled and nothing softens at high DPI.
 */
export const CurlLeaf = forwardRef<CurlHandle, CurlLeafProps>(function CurlLeaf(
  { width, height, count, centerPivot, front, back },
  ref,
) {
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([])
  const frontShadeRefs = useRef<(HTMLDivElement | null)[]>([])
  const backShadeRefs = useRef<(HTMLDivElement | null)[]>([])
  const frontSheenRefs = useRef<(HTMLDivElement | null)[]>([])
  const backSheenRefs = useRef<(HTMLDivElement | null)[]>([])

  const segmentWidth = width / count
  const overlap = seamOverlap(segmentWidth, count)
  const indices = useMemo(() => Array.from({ length: count }, (_, index) => index), [count])

  useImperativeHandle(
    ref,
    () => ({
      setProgress(progress: number) {
        const segments = computeCurl(progress, width, count)
        for (let i = 0; i < count; i++) {
          const segment = segments[i]

          const node = segmentRefs.current[i]
          if (node) {
            // Rounded to hundredths: the extra precision is invisible but
            // the shorter string cuts per-frame parsing when eighteen of
            // these are rewritten sixty times a second.
            // scaleY narrows the sheet toward its free edge so the
            // silhouette tapers like a cone instead of staying a rectangle.
            // Applied after the rotation, about the segment's own centre,
            // so the hinge chain is untouched and still closes exactly.
            node.style.transform =
              `translate3d(${segment.x.toFixed(2)}px,0,${segment.z.toFixed(2)}px)` +
              `rotateY(${segment.angle.toFixed(4)}rad)` +
              `scaleY(${segment.taper.toFixed(4)})`
          }

          const frontShade = frontShadeRefs.current[i]
          if (frontShade) frontShade.style.opacity = segment.frontShade.toFixed(3)
          const backShade = backShadeRefs.current[i]
          if (backShade) backShade.style.opacity = segment.backShade.toFixed(3)
          const frontSheen = frontSheenRefs.current[i]
          if (frontSheen) frontSheen.style.opacity = segment.frontSheen.toFixed(3)
          const backSheen = backSheenRefs.current[i]
          if (backSheen) backSheen.style.opacity = segment.backSheen.toFixed(3)
        }
      },
    }),
    [width, count],
  )

  return (
    <div className="curl-leaf" style={{ width, height }}>
      {indices.map((i) => (
        <div
          key={i}
          ref={(node) => {
            segmentRefs.current[i] = node
          }}
          className="curl-segment"
          style={{
            width: segmentWidth + overlap,
            height,
            ...(centerPivot ? { transformOrigin: '50% 50%' } : {}),
          }}
        >
          <div className="curl-face curl-face-front">
            <div
              className="curl-slide"
              style={{ width, transform: `translateX(${-i * segmentWidth}px)` }}
            >
              {front}
            </div>
            <div
              ref={(node) => {
                frontShadeRefs.current[i] = node
              }}
              className="curl-shade"
            />
            <div
              ref={(node) => {
                frontSheenRefs.current[i] = node
              }}
              className="curl-sheen"
            />
          </div>

          <div className="curl-face curl-face-back">
            <div
              className="curl-slide"
              style={{
                width,
                // Counted from the sheet's free edge: flipping the sheet
                // reverses which end of the verso meets the spine.
                transform: `translateX(${-(count - 1 - i) * segmentWidth}px)`,
              }}
            >
              {back}
            </div>
            <div
              ref={(node) => {
                backShadeRefs.current[i] = node
              }}
              className="curl-shade"
            />
            <div
              ref={(node) => {
                backSheenRefs.current[i] = node
              }}
              className="curl-sheen"
            />
          </div>
        </div>
      ))}
    </div>
  )
})
