import { routeLoaders } from '@/app/lazy-routes'

let started = false

/**
 * Once the app has settled after boot, quietly fetch the code for every
 * other screen — one chunk at a time, during idle moments — so the first
 * tap on any nav item switches instantly instead of pausing on a loader.
 *
 * This deliberately does not touch what boots: the chunks are fetched
 * after first paint, in the background, and skipped entirely when the
 * browser reports the user asked to save data.
 */
export function prefetchRoutesWhenIdle(): void {
  if (started) return
  started = true

  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (connection?.saveData) return

  const whenIdle =
    'requestIdleCallback' in window
      ? (work: () => void) => window.requestIdleCallback(work, { timeout: 4000 })
      : (work: () => void) => window.setTimeout(work, 2500)

  // Strictly after the load event: fetches started before it would join it,
  // competing with boot's own images and fonts (and dragging every warmed
  // chunk into what "loading" means on a slow connection).
  const afterLoad =
    document.readyState === 'complete'
      ? (work: () => void) => work()
      : (work: () => void) => window.addEventListener('load', () => work(), { once: true })

  afterLoad(() => whenIdle(() => {
    void (async () => {
      for (const load of Object.values(routeLoaders)) {
        try {
          await load()
        } catch {
          // A failed fetch means the network is gone or the deploy rolled
          // over; either way warming stops — navigation will fetch (and
          // surface) whatever the moment calls for.
          return
        }
      }
    })()
  }))
}
