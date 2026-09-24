import { tonicMidi } from '../music/theory'
import type { Bank, BankKind, Pad } from '../state/types'
import { DRUM_KIT_VOICES, DRUM_KITS, type DrumVoice } from './drumSynth'
import type { SynthPatch } from './synth'

/**
 * A bundled library of short, one-bar (16-step) phrases offered from the
 * Sequencer's loop menu (see components/LoopPresetMenuButton.tsx) as a
 * starting layer: each writes one bank's rows (Drums, Bass or Melody) and
 * plays through that bank's own sound. Drum hits name a kit voice; tone
 * hits are semitones above the key's home note, so a phrase follows the
 * project key. (`rootHz`/`patch` are the phrases' original synth settings,
 * kept for the style pipeline that will replace this list.)
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

/** The bank a preset writes into. */
export function loopPresetBankKind(preset: LoopPreset): BankKind {
  return preset.category === 'Drums' ? 'drums' : preset.category === 'Bass' ? 'bass' : 'melody'
}

/**
 * Where each of a preset's hits lands in a bank that already has its sound.
 * A drum hit goes to the pad playing that exact kit voice, else the first
 * pad playing the same kind of drum (so a preset still works on another
 * kit). A tone hit is read as semitones above the key's home note in the
 * bank's register and goes to the pad with the nearest pitch — so the same
 * phrase follows the project's key and, in a guided layout, snaps into it.
 */
export function loopPresetStepsByPadIndex(
  preset: LoopPreset,
  bank: Pick<Bank, 'kind' | 'sound'>,
  pads: Array<Pick<Pad, 'music'>>,
  keyTonic: number,
): Record<number, number[]> {
  const sound = bank.sound
  const kit = sound?.type === 'kit' ? DRUM_KITS.find((item) => item.id === sound.kitId) : undefined
  const voices = kit?.voices ?? DRUM_KIT_VOICES
  const home = tonicMidi(bank.kind, keyTonic)
  const steps: Record<number, number[]> = {}

  for (const { stepIndex, hit } of preset.steps) {
    let index = -1
    if (hit.kind === 'drum') {
      index = voices.findIndex((voice) => voice.name === hit.voice.name)
      if (index < 0) index = voices.findIndex((voice) => voice.kind === hit.voice.kind)
    } else {
      const target = home + hit.semitones
      let best = Infinity
      pads.forEach((pad, i) => {
        const pitch = pad.music?.midis[0]
        if (pitch === undefined) return
        const distance = Math.abs(pitch - target)
        if (distance < best) {
          best = distance
          index = i
        }
      })
    }
    if (index < 0 || index >= pads.length) continue
    ;(steps[index] ??= []).push(stepIndex)
  }
  return steps
}
