import { AudioLines, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  SOUNDSCAPES,
  startSoundscape,
  type RunningScape,
  type SoundscapeId,
} from '@/features/editor/lib/soundscapes'
import { cn } from '@/lib/utils'

/**
 * A room to write in: rain, fire, brown noise, café murmur — synthesized
 * locally with WebAudio the moment they're asked for. Nothing plays until
 * the writer chooses (their click is also the autoplay permission), and
 * the volume remembers itself.
 */
export function SoundscapeControl() {
  const [active, setActive] = useState<SoundscapeId | null>(null)
  const [volume, setVolume] = useState(() => {
    try {
      const raw = Number(localStorage.getItem('inkwell-soundscape-volume'))
      return raw >= 0.05 && raw <= 1 ? raw : 0.5
    } catch {
      return 0.5
    }
  })

  const contextRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const runningRef = useRef<RunningScape | null>(null)

  function stopAll() {
    runningRef.current?.stop()
    runningRef.current = null
    void contextRef.current?.close().catch(() => undefined)
    contextRef.current = null
    gainRef.current = null
    analyserRef.current = null
    setActive(null)
    publishDebug(null)
  }

  useEffect(() => () => stopAll(), []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Honest introspection for diagnostics and the live harness: which
   * room is on, and whether signal actually flows. */
  function publishDebug(id: SoundscapeId | null) {
    const w = window as unknown as { __inkwellSoundscape?: unknown }
    if (id === null) {
      delete w.__inkwellSoundscape
      return
    }
    w.__inkwellSoundscape = {
      id,
      state: () => contextRef.current?.state ?? 'closed',
      level: () => {
        const analyser = analyserRef.current
        if (!analyser) return 0
        const data = new Float32Array(analyser.fftSize)
        analyser.getFloatTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
        return Math.sqrt(sum / data.length)
      },
    }
  }

  function play(id: SoundscapeId) {
    stopAll()
    const context = new AudioContext()
    const gain = context.createGain()
    gain.gain.value = volume
    const analyser = context.createAnalyser()
    analyser.fftSize = 2048
    gain.connect(analyser).connect(context.destination)
    contextRef.current = context
    gainRef.current = gain
    analyserRef.current = analyser
    runningRef.current = startSoundscape(context, id, gain)
    setActive(id)
    publishDebug(id)
  }

  function handleVolume(next: number) {
    setVolume(next)
    if (gainRef.current) gainRef.current.gain.value = next
    try {
      localStorage.setItem('inkwell-soundscape-volume', String(next))
    } catch {
      /* the dial simply forgets */
    }
  }

  const activeLabel = SOUNDSCAPES.find((s) => s.id === active)?.label

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant={active ? 'secondary' : 'ghost'}
              size="icon"
              aria-label={active ? `Soundscape: ${activeLabel}` : 'Soundscapes'}
              data-soundscape={active ?? undefined}
            >
              <AudioLines className={cn('size-4', active && 'text-primary')} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          {active ? `Soundscape: ${activeLabel}` : 'Soundscapes — a room to write in'}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs">
          Synthesized on your device — works offline
        </DropdownMenuLabel>
        {SOUNDSCAPES.map((scape) => (
          <DropdownMenuItem
            key={scape.id}
            onClick={() => play(scape.id)}
            className={cn(active === scape.id && 'font-semibold text-primary')}
          >
            {scape.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={() => stopAll()} disabled={!active}>
          <VolumeX className="size-3.5" /> Off
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div
          className="px-2 py-1.5"
          // Keep the menu open while the writer drags the dial.
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="none"
        >
          <label htmlFor="soundscape-volume" className="text-xs text-muted-foreground">
            Volume
          </label>
          <input
            id="soundscape-volume"
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => handleVolume(Number(e.target.value))}
            className="mt-1 w-full accent-[var(--primary,theme(colors.violet.500))]"
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
