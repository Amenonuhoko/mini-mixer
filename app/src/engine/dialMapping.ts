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
