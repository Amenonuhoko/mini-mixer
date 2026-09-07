import { INSTRUMENT_KEY_COUNT } from '../state/constants'

export type SynthWaveform = OscillatorType

/** An ADSR-ish envelope plus a simple oscillator patch — enough character to tell presets apart without needing sample assets. */
export interface SynthPatch {
  waveform: SynthWaveform
  /** An optional second oscillator an octave up, mixed in quieter, for a richer tone (used for Piano). */
  overtoneGain?: number
  attackSeconds: number
  decaySeconds: number
  sustainLevel: number
  releaseSeconds: number
  totalDurationSeconds: number
  /** Optional lowpass to soften a bright waveform (e.g. Lead's sawtooth). */
  lowpassHz?: number
}

export interface InstrumentPreset {
  name: string
  /** Frequency of key 0 (the root); each subsequent key is one semitone higher. */
  rootHz: number
  patch: SynthPatch
}

/**
 * Bundled presets — no audio assets, everything synthesized. Deliberately
 * simple oscillator-plus-envelope patches, not attempting to sound like a
 * real piano/bass/synth patch bank; enough character to be useful starting
 * points for a casual beat maker, not a serious softsynth.
 */
export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  {
    name: 'Piano',
    rootHz: 261.63, // C4
    patch: {
      waveform: 'triangle',
      overtoneGain: 0.25,
      attackSeconds: 0.005,
      decaySeconds: 0.3,
      sustainLevel: 0.25,
      releaseSeconds: 0.8,
      totalDurationSeconds: 1.6,
    },
  },
  {
    name: 'Bass',
    rootHz: 65.41, // C2
    patch: {
      waveform: 'sine',
      attackSeconds: 0.005,
      decaySeconds: 0.15,
      sustainLevel: 0.6,
      releaseSeconds: 0.3,
      totalDurationSeconds: 0.6,
      lowpassHz: 800,
    },
  },
  {
    name: 'Lead',
    rootHz: 261.63, // C4
    patch: {
      waveform: 'sawtooth',
      attackSeconds: 0.01,
      decaySeconds: 0.2,
      sustainLevel: 0.5,
      releaseSeconds: 0.4,
      totalDurationSeconds: 1.0,
      lowpassHz: 3000,
    },
  },
]

/**
 * Renders one synthesized note into a standalone AudioBuffer via an
 * OfflineAudioContext — fully self-contained, no dependency on the app's
 * live AudioContext/AudioEngine, since offline rendering needs neither.
 */
export async function renderSynthNote(
  frequencyHz: number,
  patch: SynthPatch,
): Promise<AudioBuffer> {
  const sampleRate = 44100
  const length = Math.max(1, Math.ceil(patch.totalDurationSeconds * sampleRate))
  const ctx = new OfflineAudioContext(1, length, sampleRate)

  const envelope = ctx.createGain()
  const t = patch
  envelope.gain.setValueAtTime(0, 0)
  envelope.gain.linearRampToValueAtTime(1, t.attackSeconds)
  envelope.gain.linearRampToValueAtTime(t.sustainLevel, t.attackSeconds + t.decaySeconds)
  const releaseStart = Math.max(
    t.attackSeconds + t.decaySeconds,
    t.totalDurationSeconds - t.releaseSeconds,
  )
  envelope.gain.setValueAtTime(t.sustainLevel, releaseStart)
  envelope.gain.linearRampToValueAtTime(0, t.totalDurationSeconds)

  if (patch.lowpassHz) {
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = patch.lowpassHz
    envelope.connect(filter)
    filter.connect(ctx.destination)
  } else {
    envelope.connect(ctx.destination)
  }

  const osc = ctx.createOscillator()
  osc.type = patch.waveform
  osc.frequency.value = frequencyHz
  osc.connect(envelope)
  osc.start(0)
  osc.stop(patch.totalDurationSeconds)

  if (patch.overtoneGain) {
    const overtoneGain = ctx.createGain()
    overtoneGain.gain.value = patch.overtoneGain
    const overtoneOsc = ctx.createOscillator()
    overtoneOsc.type = 'sine'
    overtoneOsc.frequency.value = frequencyHz * 2
    overtoneOsc.connect(overtoneGain)
    overtoneGain.connect(envelope)
    overtoneOsc.start(0)
    overtoneOsc.stop(patch.totalDurationSeconds)
  }

  return ctx.startRendering()
}

/**
 * Bakes a pitch shift permanently into a new buffer via an offline render —
 * the same detune mechanism the live pitch dial already uses, just rendered
 * once instead of applied at playback time. Semitones is always >= 0 here
 * (instrument keys only ever ascend from the root), which matters: a pitched
 * source plays faster/shorter, never longer, so `source.length` samples of
 * offline context is always enough to capture it in full — no truncation.
 */
export async function renderPitchShiftedCopy(
  source: AudioBuffer,
  semitones: number,
): Promise<AudioBuffer> {
  if (semitones === 0) return source
  const ctx = new OfflineAudioContext(source.numberOfChannels, source.length, source.sampleRate)
  const bufferSource = ctx.createBufferSource()
  bufferSource.buffer = source
  bufferSource.detune.value = semitones * 100
  bufferSource.connect(ctx.destination)
  bufferSource.start(0)
  return ctx.startRendering()
}

function semitoneOffsets(): number[] {
  return Array.from({ length: INSTRUMENT_KEY_COUNT }, (_, i) => i)
}

/** Builds all of a bundled preset's keys in parallel — each render is independent. */
export async function buildInstrumentKeysFromPreset(
  preset: InstrumentPreset,
): Promise<AudioBuffer[]> {
  return Promise.all(
    semitoneOffsets().map((semitones) =>
      renderSynthNote(preset.rootHz * Math.pow(2, semitones / 12), preset.patch),
    ),
  )
}

/** Builds all of a recording-derived instrument's keys in parallel; key 0 is the recording itself, untouched. */
export async function buildInstrumentKeysFromRecording(
  rootBuffer: AudioBuffer,
): Promise<AudioBuffer[]> {
  return Promise.all(
    semitoneOffsets().map((semitones) => renderPitchShiftedCopy(rootBuffer, semitones)),
  )
}
