import type { BankKind, MoodId, MusicalKey, PadLabelSettings, PadLayout, PadMusic } from '../music/theory'

export type { BankKind, MoodId, MusicalKey, PadLabelSettings, PadLayout, PadMusic }

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
 * mic take, 'note' is a note/chord a bank generated from its sound (hidden
 * from the Library), 'sequence' is a bounced sequence or a live playthrough.
 */
export type SampleKind = 'recording' | 'note' | 'sequence'

export interface SequenceTrace {
  /** Source timeline length, retained independently of the current active pattern. */
  stepCount: number
  /**
   * One row per source pad, each cell holding the exact Sample id placed
   * there (or null) — the same shape a Pattern's own `steps` uses. Loading
   * this trace restores real, playable steps wherever a cell's sample id
   * still exists in the library; a cell whose sample has since been deleted
   * falls back to a visual-only marker instead (see LOAD_SEQUENCE_TRACE).
   */
  rows: Array<Array<string | null>>
  /** Which pad each row belonged to, when known — lets a load land rows back on the same pads across banks. Older traces omit it and load by row position. */
  padIds?: string[]
}

export interface Sample {
  id: string
  label: string
  buffer: AudioBuffer
  recordedAt: number
  kind: SampleKind
  /** Present for bounced sequencer samples, so they can later be loaded as a visual trace. */
  sequenceTrace?: SequenceTrace
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
  /**
   * What a melodic bank's pad plays — a note or a chord, as MIDI numbers —
   * so it can be labeled (name / numeral / feel) and so a key change knows
   * what it was. Null for drum and hand-assigned pads.
   */
  music: PadMusic | null
}

/**
 * What a bank's pads are generated from. A drum kit is a fixed set of voices;
 * a preset or a recording is pitched across the bank's notes/chords in the
 * project key. A bank with no sound yet (or a drum bank of hand-assigned
 * recordings) has sound: null.
 */
export type BankSound =
  | { type: 'preset'; name: string }
  | { type: 'kit'; kitId: string }
  | { type: 'recording'; sampleId: string }

/**
 * One layer of the beat — Drums, Bass, Chords or Melody — shown as a tab above
 * the pad grid. Pads themselves still live in AppState.pads (keyed by id, so
 * sequencer rows never care which bank they're in); a bank owns an ordered
 * list of pad ids and how many of them are showing.
 */
export interface Bank {
  id: string
  kind: BankKind
  /** Every pad slot this bank has ever had, in grid order. */
  padIds: string[]
  /** How many of padIds are shown/triggerable. Shrinking is display-only, same as the old global pad count. */
  visibleCount: number
  sound: BankSound | null
  /** Grid columns for this bank's layout (a scale's notes per octave, 4 for a drum kit, …). */
  columns: number
  /** Samples this bank generated for its current sound, so replacing the sound can clean them up. */
  generatedSampleIds: string[]
  /** MIDI note → sample id for every single note the bank's pads use, chord notes included — the arpeggiator's raw material. */
  noteSampleIds: Record<string, string>
  /** The whole bank's volume, 0–100 (missing = 100), on top of each pad's own level — Mix's one slider. */
  volume?: number
}

/** The Filter/Grit/Echo/Reverb "character" combo, remembered per sound (see AppState.fxBySound). */
export interface CharacterPreset {
  filter: number
  grit: number
  echo: number
  reverb: number
}

/** Everything needed to (re)lay a bank's pads — produced asynchronously by engine/bankBuilder, applied atomically by the reducer. */
export interface BankBuild {
  bankId: string
  sound: BankSound | null
  columns: number
  /** One entry per pad, in grid order. */
  pads: Array<{ sampleId: string | null; music: PadMusic | null }>
  /** Every new sample this build created (pad sounds and single-note pool). */
  samples: Sample[]
  noteSampleIds: Record<string, string>
}

export interface Phrasing {
  articulation: 'natural' | 'short' | 'detached' | 'connected'
  /** Maximum note length in sixteenth-note steps; 0 follows the next onset. */
  lengthSteps: number
  /** 0 = even, 100 = strongest accents and note-to-note dynamics. */
  dynamics: number
}

export interface Pattern {
  phrasing?: Partial<Record<BankKind, Phrasing>> | undefined
  variationLocks?: BankKind[]

  /** Generator settings belonging to this pattern, restored when editing another song part. */
  groove?: Groove | null
  id: string
  name: string
  /** Number of 16th-note cells in this pattern (starts at 16, can grow to 64). */
  stepCount: number
  /** Keyed by pad id; each cell holds the exact Sample id chosen when the step was placed, or null. */
  /** Each bank's Pitch in this pattern, in semitones (±12) — so the Verse can sit higher than the Chorus. Missing = 0. */
  pitch?: Partial<Record<BankKind, number>>
  steps: Record<string, Array<string | null>>
  /** A visual-only snapshot of prior placements. It never produces audio or enters a bounce. */
  traceSteps: Record<string, Array<string | null>> | null
  /** Hidden traces can be restored to playback; imported references stay visual-only. */
  traceSource?: 'hidden' | 'reference' | null
}

/** An ordered part of a song. Reusing a pattern keeps repeated parts linked while editing. */
export interface SongSection {
  id: string
  name: string
  patternId: string
  repeats: number
  /** Per-section levels for the four sound banks; missing values play at 100%. */
  bankVolumes?: Partial<Record<BankKind, number>>
  /** Banks removed from this section's playback without deleting the shared pattern. */
  excludedBanks?: BankKind[]
  /**
   * Set when this section's pattern is a baked ending: a copy of `basePatternId`
   * with `move` written into its last beat or bar. `of` is the section it ends
   * when the ending was split off that section's final repeat.
   */
  ending?: SectionEnding
}

/** How a section hands over to the next one, written into the pattern's steps. */
export type TransitionMove = 'fill' | 'build' | 'pause' | 'bass-drop'

export interface SectionEnding {
  move: TransitionMove
  basePatternId: string
  of?: string
}

export type LoopMode = 'once' | 'continuous'
/** Normal pad presses either stop on release (gate) or play the whole file (one-shot). */
export type PadPlaybackMode = 'gate' | 'oneshot'

export interface Transport {
  bpm: number
  isPlaying: boolean
  playMode: 'pattern' | 'song'
  currentSongSectionId: string | null
  /** The selected song range; a loop remains selected while playback is paused. */
  auditionSectionId: string | null
  auditionScope: 'section' | 'rest' | 'loop' | 'handover'
  playbackRunId: number
  loopMode: LoopMode
  metronomeEnabled: boolean
  /** Controls normal pad tap duration; Loop Mode has its own distinct behavior. */
  padPlaybackMode: PadPlaybackMode
  /** Final listening-level control, 0-100. Applies after every pad's mix/effects path. */
  masterVolume: number
  /**
   * Global mode switch for the pad grid: while on, tapping a pad toggles its
   * loop instead of playing a one-shot. Lives here alongside metronomeEnabled
   * — both are page-agnostic mode toggles, not sequencer-playback state, but
   * this is the app's established home for that kind of global on/off switch.
   */
  padLoopModeEnabled: boolean
  /**
   * A temporary overlay for changing levels, exclusive with Loop Mode. While on,
   * pads stop being tap targets entirely and become
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
   * mutually exclusive with the pad modes: recording a playthrough of loops
   * you've already started is the whole point.
   */
  playthroughRecordingEnabled: boolean
}

/** What holding a pad does beyond a single hit (see engine/performer.ts). */
export type PerformMode = 'off' | 'repeat' | 'arp'
/** Note lengths, tempo-synced; T = triplet. */
export type PerformRate = '1/4' | '1/8' | '1/8T' | '1/16' | '1/16T' | '1/32'
export type ArpPattern = 'up' | 'down' | 'upDown' | 'random'
export type StrumDirection = 'off' | 'up' | 'down'
export type StrumSpeed = 'fast' | 'medium' | 'slow'

export interface PerformSettings {
  mode: PerformMode
  rate: PerformRate
  arpPattern: ArpPattern
  /** How many octaves the arpeggio climbs through. */
  arpOctaves: 1 | 2
  /** Repeat/arp keeps going after release until the next fresh press. */
  latch: boolean
  /** Chord pads roll their notes instead of hitting them together. */
  strum: StrumDirection
  strumSpeed: StrumSpeed
}

/** One bank's preset layer: which style wrote it, which take (reroll), and how busy (0 sparse … 0.5 as written … 1 busy). */
export interface GrooveLayer {
  styleId: string
  take: number
  intensity: number
  /** 0 = the keys / drums the style uses … 1 = every pad of the bank. Missing = 0. */
  range?: number
}

/**
 * The beat the preset layers belong to (see src/styles). The beat owns the
 * seed, length and chord progression, so layers from different styles still
 * fit together; each bank's layer owns its own style, take and intensity.
 */
export interface Groove {
  seed: number
  bars: number
  /** Scale degrees (0 = home), spread evenly over the pattern. */
  progression: number[]
  layers: Partial<Record<BankKind, GrooveLayer>>
}

export interface AppState {
  /** Session-only audition snapshot. Later musical edits accept it; Keep/Undo are explicit while auditioning. */
  variationPreview?: { label: string; patterns: Pattern[]; songSections: SongSection[]; activePatternId: string; transport: Transport } | undefined

  /** The sample library ("arsenal") — first-class, independent of pad assignment. */
  samples: Record<string, Sample>
  /** Display/edit order for the library — samples themselves stay keyed by id in `samples`. */
  sampleOrder: string[]
  /** Every pad slot of every bank. Which bank a pad belongs to, and whether it's showing, lives on Bank. */
  pads: Pad[]
  /** Drums · Bass · Chords · Melody — always all four, in that order. */
  banks: Bank[]
  /** Which bank the pad grid is showing. */
  activeBankId: string
  /** The project's key — every melodic bank's pads are laid out in it. */
  key: MusicalKey
  /** The mood that picked the key, or null once the key was set by hand. */
  mood: MoodId | null
  /** Guided (only notes/chords in the key) or Free (chromatic) melodic pads. */
  padLayout: PadLayout
  /** Which label parts pads show — name, feel word, numeral. */
  padLabels: PadLabelSettings
  /**
   * The whole-bank Filter/Grit/Echo/Reverb combo last used with each sound
   * (keyed by soundKey()), so switching a bank away from a sound and back
   * brings its character back with it.
   */
  fxBySound: Record<string, CharacterPreset>
  /** Note repeat / arpeggiator / strum — how held pads perform. */
  perform: PerformSettings
  /** The style and seed of the beat being built, or null before one was generated. */
  groove: Groove | null
  patterns: Pattern[]
  activePatternId: string
  songSections: SongSection[]
  transport: Transport
}
