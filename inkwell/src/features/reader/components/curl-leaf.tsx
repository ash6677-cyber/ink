import { forwardRef, useImperativeHandle, useMemo, useRef, type ReactNode } from 'react'

import { computeCurl, SEGMENT_COUNT, seamOverlap } from '@/features/reader/lib/curl-geometry'

export interface CurlHandle {
  setProgress: (progress: number) => void
}

interface CurlLeafProps {
  width: number
  height: number
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
  { width, height, front, back },
  ref,
) {
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([])
  const frontShadeRefs = useRef<(HTMLDivElement | null)[]>([])
  const backShadeRefs = useRef<(HTMLDivElement | null)[]>([])
  const frontSheenRefs = useRef<(HTMLDivElement | null)[]>([])
  const backSheenRefs = useRef<(HTMLDivElement | null)[]>([])

  const segmentWidth = width / SEGMENT_COUNT
  const overlap = seamOverlap(segmentWidth, SEGMENT_COUNT)
  const indices = useMemo(() => Array.from({ length: SEGMENT_COUNT }, (_, index) => index), [])

  useImperativeHandle(
    ref,
    () => ({
      setProgress(progress: number) {
        const segments = computeCurl(progress, width, SEGMENT_COUNT)
        for (let i = 0; i < SEGMENT_COUNT; i++) {
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
    [width],
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
          style={{ width: segmentWidth + overlap, height }}
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
                transform: `translateX(${-(SEGMENT_COUNT - 1 - i) * segmentWidth}px)`,
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
