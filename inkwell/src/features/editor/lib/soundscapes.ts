/**
 * Focus soundscapes, synthesized on the spot: rain, fire, brown noise,
 * café murmur — WebAudio all the way down. No files, no downloads, no
 * licensing, works with the network cable cut.
 *
 * The sample math lives here as pure functions over a seeded PRNG so the
 * character of each noise is testable without an AudioContext; the thin
 * graph wiring (loops, filters, gain) is the only part that touches the
 * audio hardware.
 */

export const SOUNDSCAPES = [
  { id: 'rain', label: 'Rain' },
  { id: 'fire', label: 'Fireplace' },
  { id: 'brown', label: 'Brown noise' },
  { id: 'cafe', label: 'Café murmur' },
] as const

export type SoundscapeId = (typeof SOUNDSCAPES)[number]['id']

/** Deterministic PRNG so tests can pin the waveforms. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** White noise in [-1, 1]. */
export function whiteSamples(length: number, rng: () => number): Float32Array {
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) out[i] = rng() * 2 - 1
  return out
}

/** Brown noise: integrated white with a leak, normalized inside [-1, 1].
 * The leak keeps the random walk from wandering off to a DC cliff. */
export function brownSamples(length: number, rng: () => number): Float32Array {
  const out = new Float32Array(length)
  let last = 0
  for (let i = 0; i < length; i++) {
    const white = rng() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    out[i] = last * 3.5
  }
  // Hard safety clamp; the leak keeps values small but honesty is cheap.
  for (let i = 0; i < length; i++) out[i] = Math.max(-1, Math.min(1, out[i]))
  return out
}

/** Sparse crackle: silence with occasional decaying pops — the fire's
 * signature on top of its brown-noise roar. */
export function crackleSamples(
  length: number,
  rng: () => number,
  popsPerSecond = 6,
  sampleRate = 44100,
): Float32Array {
  const out = new Float32Array(length)
  const perSample = popsPerSecond / sampleRate
  for (let i = 0; i < length; i++) {
    if (rng() < perSample) {
      const amplitude = 0.4 + rng() * 0.6
      const decay = 60 + Math.floor(rng() * 300)
      for (let j = 0; j < decay && i + j < length; j++) {
        out[i + j] += amplitude * Math.exp(-j / (decay / 4)) * (rng() * 2 - 1)
      }
    }
  }
  for (let i = 0; i < length; i++) out[i] = Math.max(-1, Math.min(1, out[i]))
  return out
}

export function rms(samples: Float32Array): number {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / Math.max(1, samples.length))
}

/* ---- the graph: thin wiring around the sample math ------------------- */

export interface RunningScape {
  stop: () => void
}

function loopBuffer(context: AudioContext, samples: Float32Array): AudioBufferSourceNode {
  const buffer = context.createBuffer(1, samples.length, context.sampleRate)
  buffer.getChannelData(0).set(samples)
  const source = context.createBufferSource()
  source.buffer = buffer
  source.loop = true
  return source
}

/** Builds and starts a scape into `destination`. Four seconds of looped,
 * seeded noise per layer — long enough that the loop never reads as one. */
export function startSoundscape(
  context: AudioContext,
  id: SoundscapeId,
  destination: AudioNode,
): RunningScape {
  const seconds = 4
  const length = context.sampleRate * seconds
  const rng = mulberry32(0x1e55)
  const nodes: { disconnect: () => void }[] = []
  const sources: AudioBufferSourceNode[] = []

  const layer = (samples: Float32Array, build: (source: AudioBufferSourceNode) => AudioNode) => {
    const source = loopBuffer(context, samples)
    const tail = build(source)
    tail.connect(destination)
    nodes.push(tail)
    sources.push(source)
    source.start()
  }

  switch (id) {
    case 'rain': {
      // Hiss band-passed into the wet register, plus a quieter low wash.
      layer(whiteSamples(length, rng), (source) => {
        const band = context.createBiquadFilter()
        band.type = 'bandpass'
        band.frequency.value = 2400
        band.Q.value = 0.6
        const gain = context.createGain()
        gain.gain.value = 0.5
        source.connect(band).connect(gain)
        return gain
      })
      layer(brownSamples(length, rng), (source) => {
        const low = context.createBiquadFilter()
        low.type = 'lowpass'
        low.frequency.value = 400
        const gain = context.createGain()
        gain.gain.value = 0.25
        source.connect(low).connect(gain)
        return gain
      })
      break
    }
    case 'fire': {
      layer(brownSamples(length, rng), (source) => {
        const low = context.createBiquadFilter()
        low.type = 'lowpass'
        low.frequency.value = 320
        const gain = context.createGain()
        gain.gain.value = 0.55
        source.connect(low).connect(gain)
        return gain
      })
      layer(crackleSamples(length, rng, 5, context.sampleRate), (source) => {
        const high = context.createBiquadFilter()
        high.type = 'highpass'
        high.frequency.value = 1200
        const gain = context.createGain()
        gain.gain.value = 0.7
        source.connect(high).connect(gain)
        return gain
      })
      break
    }
    case 'brown': {
      layer(brownSamples(length, rng), (source) => {
        const gain = context.createGain()
        gain.gain.value = 0.7
        source.connect(gain)
        return gain
      })
      break
    }
    case 'cafe': {
      // Murmur: mid-banded noise breathing slowly, like a room talking.
      layer(brownSamples(length, rng), (source) => {
        const band = context.createBiquadFilter()
        band.type = 'bandpass'
        band.frequency.value = 500
        band.Q.value = 0.9
        const gain = context.createGain()
        gain.gain.value = 0.6
        const lfo = context.createOscillator()
        lfo.frequency.value = 0.23
        const lfoGain = context.createGain()
        lfoGain.gain.value = 0.18
        lfo.connect(lfoGain).connect(gain.gain)
        lfo.start()
        nodes.push(lfo as unknown as { disconnect: () => void })
        source.connect(band).connect(gain)
        return gain
      })
      layer(whiteSamples(length, rng), (source) => {
        const band = context.createBiquadFilter()
        band.type = 'bandpass'
        band.frequency.value = 1800
        band.Q.value = 1.4
        const gain = context.createGain()
        gain.gain.value = 0.06
        source.connect(band).connect(gain)
        return gain
      })
      break
    }
  }

  return {
    stop: () => {
      for (const source of sources) {
        try {
          source.stop()
        } catch {
          /* already stopped */
        }
      }
      for (const node of nodes) node.disconnect()
    },
  }
}
