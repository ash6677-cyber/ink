import { Loader2 } from 'lucide-react'

/**
 * Starts invisible and only fades in after a beat: screens whose code is
 * already local (prefetched or cached) mount before the reveal, so moving
 * between screens never flashes a spinner — one only appears when a load
 * is genuinely slow enough to need explaining.
 */
export function RouteLoading() {
  return (
    <div className="flex h-full items-center justify-center opacity-0 [animation:route-loading-reveal_200ms_ease_150ms_forwards]">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}
