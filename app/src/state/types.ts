export type EffectId = 'pitch' | 'speed' | 'filter'

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

export interface Pad {
  id: string
  /** Reference into AppState.samples; the pad does not own the buffer. */
  sampleId: string | null
  loop: boolean
  /** Silences the pad entirely — manual taps and sequencer steps alike — without losing its sample or pattern. */
  muted: boolean
  color: string
  icon: string
  effects: EffectSetting[]
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
