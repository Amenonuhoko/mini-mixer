export type EffectId = 'pitch' | 'speed' | 'filter'

export interface EffectSetting {
  id: EffectId
  /** 0-100 dial value; mapped to the real audio param by src/engine/dialMapping.ts */
  value: number
}

export interface Sample {
  id: string
  label: string
  buffer: AudioBuffer
  recordedAt: number
}

export interface Pad {
  id: string
  /** Reference into AppState.samples; the pad does not own the buffer. */
  sampleId: string | null
  loop: boolean
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
}

export interface AppState {
  /** The sample library ("arsenal") — first-class, independent of pad assignment. */
  samples: Record<string, Sample>
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
