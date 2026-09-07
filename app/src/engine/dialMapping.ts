/**
 * Pure mappings from a 0-100 dial value to a real Web Audio param.
 * Kept separate from AudioEngine so they're testable with no AudioContext at all.
 */

const NEUTRAL = 50

/**
 * Pitch is mapped to `AudioBufferSourceNode.detune` (cents), not `playbackRate` —
 * detune shifts pitch independently of playback speed, which plain resampling can't do.
 * Range: +/- 1200 cents (one octave either way) at the dial extremes.
 */
export function dialToDetuneCents(value: number): number {
  const normalized = (value - NEUTRAL) / NEUTRAL // -1 .. 1
  return normalized * 1200
}

/**
 * Speed is mapped to `AudioBufferSourceNode.playbackRate`.
 * Range: 0.5x (dial at 0) to 2x (dial at 100), 1x at the neutral midpoint.
 */
export function dialToPlaybackRate(value: number): number {
  if (value === NEUTRAL) return 1
  if (value < NEUTRAL) {
    return 0.5 + (value / NEUTRAL) * 0.5 // 0 -> 0.5x, 50 -> 1x
  }
  return 1 + ((value - NEUTRAL) / NEUTRAL) * 1 // 50 -> 1x, 100 -> 2x
}

/**
 * Filter is mapped to a BiquadFilterNode lowpass cutoff frequency (Hz).
 * Range: 200Hz (dial at 0, heavily muffled) to 20000Hz (dial at 100, effectively off).
 * Logarithmic, since frequency perception is logarithmic.
 */
export function dialToFilterFrequencyHz(value: number): number {
  const minHz = 200
  const maxHz = 20000
  const normalized = value / 100
  return minHz * Math.pow(maxHz / minHz, normalized)
}
