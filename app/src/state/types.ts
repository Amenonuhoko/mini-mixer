export type EffectId = 'pitch' | 'speed' | 'filter' | 'volume' | 'pan' | 'grit' | 'echo' | 'reverb'

export interface EffectSetting {
  id: EffectId
  /** -100..100 dial value, 0 = neutral/no change; mapped to the real audio param by src/engine/dialMapping.ts */
  value: number
}

/**
 * What produced a sample — drives the Library's at-a-glance "type" badge.
 * Deliberately derived from how the sample was made, not from analyzing its
 * audio content (unreliable for a lightweight app): 'recording' is a plain
 * mic take, 'note' is one key of a built Instrument, 'sequence' is a bounced
 * multi-hit performance (either the Instrument Mode hit-capture or a full
 * loops-and-gates playthrough).
 */
export type SampleKind = 'recording' | 'note' | 'sequence'

export interface Sample {
  id: string
  label: string
  buffer: AudioBuffer
  recordedAt: number
  kind: SampleKind
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
  effects: EffectSetting[]
  /**
   * Plays the pad as if every effect dial were at neutral (0), without
   * touching the stored dial values — a reversible bypass, not a reset.
   * Turning it back off restores exactly what was dialed in before.
   */
  effectsBypassed: boolean
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
  /**
   * A separate "mixer fader" gain, 0-100 (0 = silent, 100 = unity/full) —
   * deliberately distinct from the Volume effect dial (-100..100, a per-pad
   * character/boost control you dial in once while editing a sound). This is
   * the quick, always-in-reach "how loud does this pad sit in the mix right
   * now" level, adjusted live via Mixer Mode (see Transport.padMixerModeEnabled)
   * rather than by opening the pad editor.
   */
  mixLevel: number
}

export interface Instrument {
  id: string
  name: string
  source: 'preset' | 'recording'
  /**
   * References into AppState.samples. For a pitched preset/recording instrument,
   * ordered low to high pitch (semitone 0 first). A drum kit is the exception —
   * its 16 keys are 16 distinct voices, not one sound pitch-shifted, so there's
   * no pitch to order by; it's ordered by how often each voice gets reached for
   * instead (see engine/drumSynth.ts's DRUM_KIT_VOICES).
   */
  keySampleIds: string[]
}

export interface Pattern {
  id: string
  name: string
  /** Keyed by pad id; each array is STEP_COUNT booleans. */
  steps: Record<string, boolean[]>
}

export type LoopMode = 'once' | 'continuous'

/** The fields temporary Instrument Mode replaces on a pad, retained so cleanup can restore the user's layout. */
export interface InstrumentPadSnapshot {
  sampleId: string | null
  trimStart: number
  trimEnd: number
}

export interface Transport {
  bpm: number
  isPlaying: boolean
  loopMode: LoopMode
  currentStep: number
  metronomeEnabled: boolean
  /**
   * Global mode switch for the pad grid: while on, tapping a pad toggles its
   * loop instead of playing a one-shot. Lives here alongside metronomeEnabled
   * — both are page-agnostic mode toggles, not sequencer-playback state, but
   * this is the app's established home for that kind of global on/off switch.
   */
  padLoopModeEnabled: boolean
  /**
   * The pad grid's other mode toggle, mutually exclusive with padLoopModeEnabled
   * (turning one on turns the other off — see reducer.ts). While on, pads keep
   * playing normally (one-shot/gate, same as the default mode) but show which
   * instrument key they hold, and holding the record FAB captures the series of
   * pad presses as a performance instead of recording from the microphone.
   */
  padInstrumentModeEnabled: boolean
  /**
   * The third pad-grid mode, mutually exclusive with the two above (see
   * reducer.ts). While on, pads stop being tap targets entirely and become
   * vertical fader sliders instead — dragging up/down on a pad sets its
   * mixLevel live. Nothing plays from a tap/drag in this mode; it's a mixing
   * surface, meant to be used while a pattern or loops are already playing.
   */
  padMixerModeEnabled: boolean
  /**
   * Independent of the two pad-grid modes above: while on, holding the record
   * FAB captures a live "playthrough" of whatever's actually audible (every
   * looping pad plus every manual tap/gate) instead of recording from the
   * microphone — see AudioEngine.startPlaythroughRecording. Deliberately not
   * mutually exclusive with loop/instrument mode: recording a playthrough of
   * loops you've already started, or of an instrument you're playing live, is
   * the whole point.
   */
  playthroughRecordingEnabled: boolean
  /**
   * The id of an instrument InstrumentModeButton's quick-build picker created
   * on the spot (as opposed to one deliberately built via the Library page),
   * or null if none/not applicable. Lives here (in-memory app state, not
   * component-local) specifically so it survives navigating away from the
   * Pads page and back — the button component unmounts on every page switch,
   * which would otherwise lose track of which instrument to clean up. Turning
   * Instrument Mode off through any mode control removes this instrument (the
   * App shell observes the mode and dispatches REMOVE_INSTRUMENT). Deliberately
   * transient, like isPlaying/currentStep: reset to null on every project
   * load rather than persisted, since once a project has been explicitly
   * saved, whatever instruments it contains are project data, not something
   * still owed a silent auto-delete.
   */
  autoInstrumentId: string | null
  /** Pre-instrument assignments for a quick Instrument Mode preset; transient and never persisted. */
  autoInstrumentPadSnapshot: Record<string, InstrumentPadSnapshot> | null
}

export interface AppState {
  /** The sample library ("arsenal") — first-class, independent of pad assignment. */
  samples: Record<string, Sample>
  /** Display/edit order for the library — samples themselves stay keyed by id in `samples`. */
  sampleOrder: string[]
  /** Named groups of samples pitch-spread across a keyboard — see Instrument. */
  instruments: Record<string, Instrument>
  /** Display order for the library's instrument list, same idea as sampleOrder. */
  instrumentOrder: string[]
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
