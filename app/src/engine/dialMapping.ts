/**
 * Pure mappings from a bipolar -100..100 dial value (0 = neutral, no change) to
 * real Web Audio params. Kept separate from AudioEngine so they're testable with
 * no AudioContext at all.
 */

/**
 * Pitch is mapped to `AudioBufferSourceNode.detune` (cents), not `playbackRate` —
 * detune shifts pitch independently of playback speed, which plain resampling can't do.
 * Range: -1200..+1200 cents (one octave either way), 0 at dial 0.
 */
export function dialToDetuneCents(value: number): number {
  return (value / 100) * 1200
}

/**
 * Speed is mapped to `AudioBufferSourceNode.playbackRate`.
 * Range: 0.5x (dial -100) to 2x (dial +100), 1x (unchanged) at dial 0.
 */
export function dialToPlaybackRate(value: number): number {
  if (value === 0) return 1
  if (value < 0) {
    return 1 + (value / 100) * 0.5 // -100 -> 0.5x
  }
  return 1 + (value / 100) * 1 // +100 -> 2x
}

export type FilterShape = 'lowpass' | 'highpass' | 'allpass'

export interface FilterParams {
  type: FilterShape
  frequencyHz: number
}

/**
 * Filter is a bipolar tone control, not a one-directional sweep: negative values
 * progressively muffle (lowpass, cutoff dropping as the dial goes further negative),
 * positive values progressively thin the sound out (highpass, cutoff rising), and 0
 * is neutral. Modeled as a single BiquadFilterNode whose `type` and `frequency` both
 * change with the dial — `type` is a plain settable property (no node recreation
 * needed), which is what makes live updates on an already-playing loop possible
 * without any graph rewiring or audible glitch.
 *
 * At exactly 0 the node is set to 'allpass', which passes all frequencies through
 * with negligible audible effect (only phase, not amplitude, is affected) — chosen
 * over literally removing the filter node from the graph so the node topology never
 * changes while a pad is looping, only its params.
 */
export function dialToFilterParams(value: number): FilterParams {
  if (value === 0) {
    return { type: 'allpass', frequencyHz: 1000 }
  }
  if (value < 0) {
    const normalized = (100 + value) / 100 // -100 -> 0 (most muffled), ~0 -> ~1 (barely filtered)
    return { type: 'lowpass', frequencyHz: 200 * Math.pow(20000 / 200, normalized) }
  }
  const normalized = value / 100 // ~0 -> ~0 (barely filtered), 100 -> 1 (thinnest)
  return { type: 'highpass', frequencyHz: 20 * Math.pow(2000 / 20, normalized) }
}

/**
 * Volume is mapped to a GainNode's gain. Range: silent (dial -100) to a loud 2x
 * boost (dial +100, can drive the signal into clipping if pushed hard — that's an
 * accepted, even occasionally desirable, side effect rather than a bug), unity
 * (unchanged) at dial 0.
 */
export function dialToGain(value: number): number {
  return 1 + value / 100
}

export type GritMode = 'clean' | 'crush' | 'drive'

export interface GritParams {
  mode: GritMode
  /** 0 (no effect) .. 1 (maximum). */
  amount: number
}

/**
 * Grit is a bipolar character dial, not a one-directional "amount of distortion"
 * knob: negative crushes the sound into a harsh, quantized, digital lo-fi texture;
 * positive drives it into a warmer, analog-style soft-clip saturation. 0 is clean —
 * same "two different characters either side of neutral" idea as Filter.
 */
export function dialToGritParams(value: number): GritParams {
  if (value === 0) return { mode: 'clean', amount: 0 }
  if (value < 0) return { mode: 'crush', amount: -value / 100 }
  return { mode: 'drive', amount: value / 100 }
}

const GRIT_CURVE_LENGTH = 1024

/**
 * Builds a WaveShaperNode curve for the given grit params — a plain Float32Array
 * of output-for-input samples, so this is pure and testable with no AudioContext.
 */
export function buildGritCurve(params: GritParams): Float32Array<ArrayBuffer> {
  // Explicit ArrayBuffer-backed construction — WaveShaperNode.curve is typed as
  // Float32Array<ArrayBuffer>, stricter than the ArrayBufferLike TS infers from
  // `new Float32Array(length)` alone.
  const curve = new Float32Array(
    new ArrayBuffer(GRIT_CURVE_LENGTH * Float32Array.BYTES_PER_ELEMENT),
  )
  for (let i = 0; i < GRIT_CURVE_LENGTH; i++) {
    const x = (i / (GRIT_CURVE_LENGTH - 1)) * 2 - 1 // -1..1
    curve[i] = shapeGritSample(x, params)
  }
  return curve
}

function shapeGritSample(x: number, { mode, amount }: GritParams): number {
  if (mode === 'clean' || amount <= 0) return x
  if (mode === 'drive') {
    // Soft-clip saturation via tanh — increasing drive pushes more of the
    // waveform into the curve's shoulder, adding warmth, then outright grind.
    const drive = 1 + amount * 12
    return Math.tanh(x * drive) / Math.tanh(drive)
  }
  // Crush: quantize to progressively fewer steps for a harsh, digital lo-fi
  // character. amount 0 -> 32 steps (barely audible), amount 1 -> 4 steps (harsh).
  const steps = Math.round(32 - amount * 28)
  return Math.round(x * steps) / steps
}

/**
 * Pad.mixLevel (0-100, a plain fader) to a GainNode value — unlike the other
 * mappings here, this one isn't bipolar: 0 is silent, 100 is unity/full, with
 * nothing past unity (no boost) since this is a mix-balance control, not a
 * character/loudness effect the way the Volume dial is.
 */
export function mixLevelToGain(level: number): number {
  return level / 100
}

/**
 * Pan is mapped to `StereoPannerNode.pan` directly — the dial's own -100..100
 * range already matches the param's -1..1 range in shape, just scaled: -100
 * is hard left, 0 is center, +100 is hard right.
 */
export function dialToPan(value: number): number {
  return value / 100
}

export interface ReverbParams {
  decaySeconds: number
  /** How loud the reverbed signal is mixed in alongside the dry signal, 0..~0.5. */
  wetMix: number
}

/**
 * Reverb is a bipolar space dial, the same "one effect, two textures" shape
 * as Echo: negative is a small, tight room (a short decay, subtle presence),
 * positive is a large, spacious hall (a long decay, more wash). 0 is fully
 * dry — no reverb at all. Paired with buildReverbImpulse below to actually
 * produce the room character via convolution.
 */
export function dialToReverbParams(value: number): ReverbParams {
  const amount = Math.abs(value) / 100 // 0..1
  const decaySeconds = value < 0 ? 0.25 + amount * 0.75 : 1 + amount * 2.5
  return { decaySeconds, wetMix: amount * 0.5 }
}

/**
 * Builds a synthetic impulse response for ConvolverNode — decaying white
 * noise, the standard cheap way to fake a room without a real recorded IR —
 * so Reverb needs no audio asset, same "everything synthesized" approach
 * Echo/Grit/the instrument presets all already take. Takes a BaseAudioContext
 * (not AudioContext specifically) so the same function works unchanged from
 * both AudioEngine's live context and bouncePattern's OfflineAudioContext.
 */
export function buildReverbImpulse(ctx: BaseAudioContext, decaySeconds: number): AudioBuffer {
  const length = Math.max(1, Math.round(decaySeconds * ctx.sampleRate))
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2)
    }
  }
  return impulse
}

export interface EchoParams {
  delaySeconds: number
  /** How much of the echoed signal feeds back into itself, 0..~0.45. */
  feedback: number
  /** How loud the echo is mixed in alongside the dry signal, 0..~0.5. */
  wetMix: number
}

/**
 * Echo is a bipolar space dial, one delay-based effect with two textures rather
 * than a wet-dry-only knob: negative is a tight, quick slapback (a short delay,
 * closer to doubling than a distinct echo); positive is a longer, spacier delay
 * with more audible repeats. 0 is fully dry — no echo at all.
 */
export function dialToEchoParams(value: number): EchoParams {
  const amount = Math.abs(value) / 100 // 0..1
  const delaySeconds = value < 0 ? 0.06 + amount * 0.09 : 0.15 + amount * 0.35
  return {
    delaySeconds,
    feedback: amount * 0.45,
    wetMix: amount * 0.5,
  }
}
