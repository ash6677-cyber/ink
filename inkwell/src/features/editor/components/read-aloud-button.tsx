import { Pause, Play, Square, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  createReadAloud,
  speechSupported,
  type ReadAloudController,
  type ReadAloudState,
} from '@/lib/editor/read-aloud'

/**
 * Reads the current scene aloud through the browser's own voice. Proofing
 * by ear catches what the eye skims. Free and offline; the control simply
 * isn't rendered on a browser that can't speak.
 */
export function ReadAloudButton({ text }: { text: string }) {
  const [state, setState] = useState<ReadAloudState>('idle')
  const controllerRef = useRef<ReadAloudController | null>(null)
  const supported = useMemo(() => speechSupported(), [])

  useEffect(() => {
    if (!supported) return
    const controller = createReadAloud(setState)
    controllerRef.current = controller
    return () => controller.stop()
  }, [supported])

  // Never keep talking after the writer navigates away from the scene.
  useEffect(() => {
    return () => controllerRef.current?.stop()
  }, [])

  if (!supported) return null

  function toggle() {
    const controller = controllerRef.current
    if (!controller) return
    if (state === 'idle') controller.play(text)
    else if (state === 'playing') controller.pause()
    else controller.resume()
  }

  const label = state === 'playing' ? 'Pause reading' : state === 'paused' ? 'Resume reading' : 'Read aloud'
  const Icon = state === 'playing' ? Pause : state === 'paused' ? Play : Volume2

  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={state !== 'idle' ? 'secondary' : 'ghost'}
            size="icon"
            onClick={toggle}
            aria-label={label}
            disabled={!text.trim()}
          >
            <Icon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      {state !== 'idle' && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => controllerRef.current?.stop()}
              aria-label="Stop reading"
            >
              <Square className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Stop reading</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
