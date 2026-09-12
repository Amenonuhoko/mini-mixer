import { INSTRUMENT_KEY_COUNT } from '../state/constants'
import { buildDrumKitKeys, DRUM_KIT_VOICES, type DrumVoice } from './drumSynth'
import { buildInstrumentKeysFromPreset, type SynthPatch } from './synth'

/**
 * A bundled library of short, one-bar (16-step) phrases offered from the
 * Sequencer's loop-preset menu (see components/LoopPresetMenuButton.tsx) as
 * a shortcut to programming a pattern by hand: picking one builds whatever
 * instrument it needs (the default Acoustic Drums kit, or a pitched preset
 * for a Bass/Melody phrase) and writes its exact steps onto the grid. Each
 * preset is entirely synthesized (no audio assets, no network dependency —
 * deliberately uses `voice: 'pluck'` for its Bass/Melody patches rather than
 * `'bass'`/`'guitar'`, which would otherwise try a recorded-sample fetch
 * before falling back) and can involve several hits/voices in one phrase —
 * unlike an Instrument's keys (one sound, pitch-shifted) or a single drum
 * voice (one hit, repeated), a "loop" here is a small self-contained musical
 * idea, the way a loop in a sample-library browser would be.
 */
export type LoopCategory = 'Drums' | 'Bass' | 'Melody'

interface DrumHit {
  kind: 'drum'
  voice: DrumVoice
}

interface ToneHit {
  kind: 'tone'
  /** Semitones above the preset's own rootHz. */
  semitones: number
}

interface LoopStep {
  stepIndex: number
  hit: DrumHit | ToneHit
}

export interface LoopPreset {
  id: string
  name: string
  category: LoopCategory
  /** Root frequency for this preset's 'tone' hits — unused if every hit is a drum. */
  rootHz?: number
  /** Envelope/waveform shared by every 'tone' hit in this preset — unused if every hit is a drum. */
  patch?: SynthPatch
  steps: LoopStep[]
}

function drumVoice(name: string): DrumVoice {
  const voice = DRUM_KIT_VOICES.find((v) => v.name === name)
  if (!voice) throw new Error(`loopPresets: unknown drum voice "${name}"`)
  return voice
}

function drumSteps(indices: number[], voiceName: string): LoopStep[] {
  const voice = drumVoice(voiceName)
  return indices.map((stepIndex) => ({ stepIndex, hit: { kind: 'drum', voice } }))
}

function toneSteps(entries: Array<[stepIndex: number, semitones: number]>): LoopStep[] {
  return entries.map(([stepIndex, semitones]) => ({ stepIndex, hit: { kind: 'tone', semitones } }))
}

const BASS_PATCH: SynthPatch = {
  voice: 'pluck',
  waveform: 'sine',
  attackSeconds: 0.005,
  decaySeconds: 0.15,
  sustainLevel: 0.5,
  releaseSeconds: 0.25,
  totalDurationSeconds: 0.4,
}

const PLUCK_PATCH: SynthPatch = {
  voice: 'pluck',
  waveform: 'triangle',
  attackSeconds: 0.002,
  decaySeconds: 0.1,
  sustainLevel: 0.05,
  releaseSeconds: 0.1,
  totalDurationSeconds: 0.25,
}

const BASS_ROOT_HZ = 82.41 // E2 — a typical bass register
const MELODY_ROOT_HZ = 261.63 // C4

// The default Acoustic Drums kit (DRUM_KIT_VOICES) has no exact 'Snare' or
// 'Clap' voice — its names are more specific (e.g. 'Snare Center', 'Side
// Stick') than the drum-machine-style single-voice-per-role kit these
// presets were originally written against, so the closest matching voice
// stands in for each role.
export const LOOP_PRESETS: LoopPreset[] = [
  {
    id: 'loop_four_on_floor',
    name: 'Four on the Floor',
    category: 'Drums',
    steps: [
      ...drumSteps([0, 4, 8, 12], 'Kick'),
      ...drumSteps([0, 2, 4, 6, 8, 10, 12, 14], 'Closed Hat'),
    ],
  },
  {
    id: 'loop_boom_bap',
    name: 'Boom Bap',
    category: 'Drums',
    steps: [
      ...drumSteps([0, 10], 'Kick'),
      ...drumSteps([4, 12], 'Snare Center'),
      ...drumSteps([0, 2, 4, 6, 8, 10, 12, 14], 'Closed Hat'),
    ],
  },
  {
    id: 'loop_disco_hats',
    name: 'Disco Hats',
    category: 'Drums',
    steps: [
      ...drumSteps([0, 2, 4, 6, 8, 10, 12], 'Closed Hat'),
      ...drumSteps([14], 'Open Hat'),
    ],
  },
  {
    id: 'loop_breakbeat',
    name: 'Breakbeat',
    category: 'Drums',
    steps: [
      ...drumSteps([0, 3, 10], 'Kick'),
      ...drumSteps([4, 12], 'Snare Center'),
      ...drumSteps([0, 2, 4, 6, 8, 10, 12, 14], 'Closed Hat'),
      ...drumSteps([7, 15], 'Open Hat'),
    ],
  },
  {
    id: 'loop_trap_hats',
    name: 'Trap Hats',
    category: 'Drums',
    steps: [
      ...drumSteps([0, 8], 'Kick'),
      ...drumSteps([4, 12], 'Side Stick'),
      ...drumSteps([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 'Closed Hat'),
    ],
  },
  {
    id: 'loop_bass_pulse',
    name: 'Bass Pulse',
    category: 'Bass',
    rootHz: BASS_ROOT_HZ,
    patch: BASS_PATCH,
    steps: toneSteps([
      [0, 0],
      [4, 0],
      [8, 0],
      [12, 0],
    ]),
  },
  {
    id: 'loop_walking_bass',
    name: 'Walking Bass',
    category: 'Bass',
    rootHz: BASS_ROOT_HZ,
    patch: BASS_PATCH,
    steps: toneSteps([
      [0, 0],
      [4, 2],
      [8, 4],
      [12, 2],
    ]),
  },
  {
    id: 'loop_octave_bounce',
    name: 'Octave Bounce',
    category: 'Bass',
    rootHz: BASS_ROOT_HZ,
    patch: BASS_PATCH,
    steps: toneSteps([
      [0, 0],
      [2, 12],
      [4, 0],
      [6, 12],
      [8, 0],
      [10, 12],
      [12, 0],
      [14, 12],
    ]),
  },
  {
    id: 'loop_syncopated_bass',
    name: 'Syncopated Bass',
    category: 'Bass',
    rootHz: BASS_ROOT_HZ,
    patch: BASS_PATCH,
    steps: toneSteps([
      [3, 0],
      [7, 0],
      [10, 7],
      [14, 0],
    ]),
  },
  {
    id: 'loop_root_and_fifth',
    name: 'Root and Fifth',
    category: 'Bass',
    rootHz: BASS_ROOT_HZ,
    patch: BASS_PATCH,
    steps: toneSteps([
      [0, 0],
      [4, 7],
      [8, 0],
      [12, 7],
    ]),
  },
  {
    id: 'loop_arpeggio_up',
    name: 'Arpeggio Up',
    category: 'Melody',
    rootHz: MELODY_ROOT_HZ,
    patch: PLUCK_PATCH,
    steps: toneSteps([
      [0, 0],
      [2, 4],
      [4, 7],
      [6, 12],
      [8, 0],
      [10, 4],
      [12, 7],
      [14, 12],
    ]),
  },
  {
    id: 'loop_simple_riff',
    name: 'Simple Riff',
    category: 'Melody',
    rootHz: MELODY_ROOT_HZ,
    patch: PLUCK_PATCH,
    steps: toneSteps([
      [0, 0],
      [2, 2],
      [4, 4],
      [8, 7],
      [10, 4],
      [12, 2],
      [14, 0],
    ]),
  },
  {
    id: 'loop_descending_run',
    name: 'Descending Run',
    category: 'Melody',
    rootHz: MELODY_ROOT_HZ,
    patch: PLUCK_PATCH,
    steps: toneSteps([
      [0, 12],
      [2, 7],
      [4, 4],
      [6, 0],
      [8, 12],
      [10, 7],
      [12, 4],
      [14, 0],
    ]),
  },
  {
    id: 'loop_call_and_response',
    name: 'Call and Response',
    category: 'Melody',
    rootHz: MELODY_ROOT_HZ,
    patch: PLUCK_PATCH,
    steps: toneSteps([
      [0, 0],
      [2, 4],
      [4, 7],
      [8, 12],
      [10, 7],
      [12, 4],
    ]),
  },
  {
    id: 'loop_bouncy_hook',
    name: 'Bouncy Hook',
    category: 'Melody',
    rootHz: MELODY_ROOT_HZ,
    patch: PLUCK_PATCH,
    steps: toneSteps([
      [0, 0],
      [3, 7],
      [6, 4],
      [9, 12],
      [12, 7],
      [15, 0],
    ]),
  },
]

/**
 * Which pad (0-based, matching the order APPLY_INSTRUMENT_TO_PADS/
 * APPLY_LOOP_PRESET lay an instrument's keys across) a given hit ends up on
 * once its preset's instrument is built. A drum hit lands on whichever pad
 * holds that exact voice — found by identity in DRUM_KIT_VOICES, the same
 * array buildDrumKitKeys renders 1:1 and in order, so its index there is
 * also its key/pad index. A tone hit lands on the pad holding that many
 * semitones above the root, since buildInstrumentKeysFromPreset's key `i` is
 * always the root shifted up `i` semitones — so the semitone count *is* the
 * pad index, with no separate lookup needed.
 */
export function padIndexForHit(hit: DrumHit | ToneHit): number {
  return hit.kind === 'drum' ? DRUM_KIT_VOICES.indexOf(hit.voice) : hit.semitones
}

/** Builds the instrument keys a preset's own hits need — the default Acoustic Drums kit for a Drums-category preset, or its own pitched patch spread across the keyboard otherwise. Same builders InstrumentModeButton's quick presets use. */
export async function buildLoopPresetInstrumentKeys(preset: LoopPreset): Promise<AudioBuffer[]> {
  if (preset.category === 'Drums') return buildDrumKitKeys()
  return buildInstrumentKeysFromPreset({
    name: preset.name,
    rootHz: preset.rootHz ?? MELODY_ROOT_HZ,
    patch: preset.patch ?? PLUCK_PATCH,
  })
}

/** Labels to pair with buildLoopPresetInstrumentKeys's buffers, in the same order. */
export function loopPresetKeyLabels(preset: LoopPreset): string[] {
  if (preset.category === 'Drums') return DRUM_KIT_VOICES.map((voice) => voice.name)
  return Array.from({ length: INSTRUMENT_KEY_COUNT }, (_, i) => `${preset.name} ${i + 1}`)
}
