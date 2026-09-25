/**
 * How much slack the audio gets on this device. Phones render audio on a
 * slower core, with more timing jitter, than a laptop — and every missed
 * render deadline is an audible crackle. Measured in Chromium with the
 * playout-stats underrun counter (see JOURNAL): a 40 ms output buffer
 * nearly doubles the headroom before dropouts (45% → 80% of each render
 * quantum free) at the cost of ~30 ms extra tap-to-sound latency, which is
 * worth it on a phone and not on a desktop.
 */
export interface AudioProfile {
  /** The AudioContext's requested output buffer. */
  latencyHint: AudioContextLatencyCategory | number
  /** Every one-shot note playing at once, across all pads. */
  maxVoices: number
  /** How far ahead the sequencer schedules — covers main-thread stalls (GC, layout) without dropping hits. */
  scheduleAheadSeconds: number
  /** Reverb as one mono convolution per room (widened with a short delay) instead of two. */
  lightReverb: boolean
}

const DESKTOP: AudioProfile = { latencyHint: 'interactive', maxVoices: 48, scheduleAheadSeconds: 0.1, lightReverb: false }
const PHONE: AudioProfile = { latencyHint: 0.04, maxVoices: 32, scheduleAheadSeconds: 0.18, lightReverb: true }

/** A touch-first device: coarse pointer, no mouse or trackpad. */
function isTouchFirst(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches
}

export const AUDIO_PROFILE: AudioProfile = isTouchFirst() ? PHONE : DESKTOP
