export type EffectId = 'pitch' | 'speed' | 'filter' | 'volume' | 'grit' | 'echo'

export interface EffectSetting {
  id: EffectId
  /** -100..100 dial value, 0 = neutral/no change; mapped to the real audio param by src/engine/dialMapping.ts */
  value: number
}

export interface Sample {
  id: string
  label: string
  buffer: AudioBuffer
  recordedAt: number
  /** Precomputed peak amplitudes (0-1) for a static waveform thumbnail — see src/utils/waveform.ts. */
  peaks: number[]
}

/**
 * Deliberately no `loop: boolean` here — "is this pad currently looping" is
 * ephemeral playback state (AudioEngine.isPadLooping), not a persisted mode.
 * A pad body tap always plays a one-shot; the dedicated loop button starts/stops
 * an actual loop as an action, so there's nothing to persist between loads.
 */
export interface Pad {
  id: string
  /** Reference into AppState.samples; the pad does not own the buffer. */
  sampleId: string | null
  /** Silences the pad entirely — manual taps and sequencer steps alike — without losing its sample or pattern. */
  muted: boolean
  color: string
  icon: string
  effects: EffectSetting[]
  /**
   * Non-destructive trim window into the assigned sample, as fractions (0-1) of
   * its duration — not stored in seconds, so it stays meaningful if the sample is
   * ever re-decoded, and resets to (0, 1) whenever a different sample is assigned
   * (a trim on the old recording's waveform has no correct meaning on a new one).
   * Two pads can reference the same sample with different trims — this is what
   * makes chopping one long recording across multiple pads possible.
   */
  trimStart: number
  trimEnd: number
}

export interface Pattern {
  id: string
  name: string
  /** Keyed by pad id; each array is STEP_COUNT booleans. */
  steps: Record<string, boolean[]>
}

export type LoopMode = 'once' | 'continuous'

export interface Transport {
  bpm: number
  isPlaying: boolean
  loopMode: LoopMode
  currentStep: number
  metronomeEnabled: boolean
}

export interface AppState {
  /** The sample library ("arsenal") — first-class, independent of pad assignment. */
  samples: Record<string, Sample>
  /** Display/edit order for the library — samples themselves stay keyed by id in `samples`. */
  sampleOrder: string[]
  /** Every pad slot that has ever existed. Shrinking the visible count never removes entries here. */
  pads: Pad[]
  /**
   * How many pads (from the front of `pads`) are currently shown/triggerable.
   * Shrinking this is display-only — pads beyond it, and their data, are retained
   * and reappear if the count is grown back.
   */
  visiblePadCount: number
  patterns: Pattern[]
  activePatternId: string
  transport: Transport
}
