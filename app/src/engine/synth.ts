import { INSTRUMENT_KEY_COUNT } from '../state/constants'

export type SynthWaveform = OscillatorType
type InstrumentVoice = 'piano' | 'bass' | 'lead' | 'pad' | 'pluck' | 'organ' | 'bell' | 'guitar'

/**
 * The synth bank deliberately distinguishes an instrument's sound-producing
 * model from its general envelope. Lead and Pad stay oscillator voices; the
 * acoustic-style presets select a focused procedural model instead of trying
 * to make every sound from one oscillator plus ADSR.
 */
export interface SynthPatch {
  voice: InstrumentVoice
  waveform: SynthWaveform
  overtoneGain?: number
  unisonDetuneCents?: number
  attackSeconds: number
  decaySeconds: number
  sustainLevel: number
  releaseSeconds: number
  totalDurationSeconds: number
  lowpassHz?: number
}

export interface InstrumentPreset {
  name: string
  /** Frequency of key 0 (the root); each subsequent key is one semitone higher. */
  rootHz: number
  patch: SynthPatch
}

/**
 * Procedural instruments, not generic waveforms wearing instrument labels:
 * piano uses decaying partials plus a hammer transient; bass adds a short
 * pluck and filtered harmonic body; pluck/guitar use a Karplus-Strong string;
 * organ is a drawbar stack; Bell is a set of inharmonic modes. Lead and Pad
 * remain intentionally synthetic but gain detuned unison voices.
 */
export const INSTRUMENT_PRESETS: InstrumentPreset[] = [
  {
    name: 'Piano',
    rootHz: 261.63,
    patch: {
      voice: 'piano',
      waveform: 'triangle',
      attackSeconds: 0.003,
      decaySeconds: 0.8,
      sustainLevel: 0,
      releaseSeconds: 1.8,
      totalDurationSeconds: 2.8,
    },
  },
  {
    name: 'Bass',
    rootHz: 65.41,
    patch: {
      voice: 'bass',
      waveform: 'sine',
      attackSeconds: 0.004,
      decaySeconds: 0.25,
      sustainLevel: 0.45,
      releaseSeconds: 0.35,
      totalDurationSeconds: 1.15,
      lowpassHz: 1050,
    },
  },
  {
    name: 'Lead',
    rootHz: 261.63,
    patch: {
      voice: 'lead',
      waveform: 'sawtooth',
      overtoneGain: 0.18,
      unisonDetuneCents: 11,
      attackSeconds: 0.008,
      decaySeconds: 0.16,
      sustainLevel: 0.58,
      releaseSeconds: 0.42,
      totalDurationSeconds: 1.2,
      lowpassHz: 3600,
    },
  },
  {
    name: 'Pad',
    rootHz: 261.63,
    patch: {
      voice: 'pad',
      waveform: 'sawtooth',
      overtoneGain: 0.12,
      unisonDetuneCents: 17,
      attackSeconds: 0.48,
      decaySeconds: 0.45,
      sustainLevel: 0.7,
      releaseSeconds: 1.8,
      totalDurationSeconds: 3.5,
      lowpassHz: 1900,
    },
  },
  {
    name: 'Pluck',
    rootHz: 261.63,
    patch: {
      voice: 'pluck',
      waveform: 'triangle',
      attackSeconds: 0.001,
      decaySeconds: 0.22,
      sustainLevel: 0,
      releaseSeconds: 0.2,
      totalDurationSeconds: 1.25,
    },
  },
  {
    name: 'Organ',
    rootHz: 261.63,
    patch: {
      voice: 'organ',
      waveform: 'sine',
      attackSeconds: 0.012,
      decaySeconds: 0.08,
      sustainLevel: 0.9,
      releaseSeconds: 0.22,
      totalDurationSeconds: 1.6,
    },
  },
  {
    name: 'Bell',
    rootHz: 261.63,
    patch: {
      voice: 'bell',
      waveform: 'sine',
      attackSeconds: 0.002,
      decaySeconds: 1.2,
      sustainLevel: 0,
      releaseSeconds: 1.7,
      totalDurationSeconds: 3.6,
    },
  },
  {
    name: 'Guitar',
    rootHz: 164.81,
    patch: {
      voice: 'guitar',
      waveform: 'sawtooth',
      attackSeconds: 0.002,
      decaySeconds: 0.45,
      sustainLevel: 0,
      releaseSeconds: 0.65,
      totalDurationSeconds: 2,
      lowpassHz: 3400,
    },
  },
]

function createRenderedBuffer(durationSeconds: number): AudioBuffer {
  const sampleRate = 44100
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(durationSeconds * sampleRate)), sampleRate)
  return ctx.createBuffer(1, Math.max(1, Math.ceil(durationSeconds * sampleRate)), sampleRate)
}

/**
 * Sets a consistent RMS level for every rendered key. Peak-only limiting lets
 * quiet sustained sounds and transient-heavy sounds feel radically different;
 * RMS normalisation brings their usable level together, while the ceiling
 * preserves headroom and prevents boosted renderings from clipping.
 */
function normalize(buffer: AudioBuffer, targetRms = 0.16, ceiling = 0.82): AudioBuffer {
  const data = buffer.getChannelData(0)
  let peak = 0
  let energy = 0
  for (const value of data) {
    const magnitude = Math.abs(value)
    peak = Math.max(peak, magnitude)
    energy += value * value
  }

  const rms = Math.sqrt(energy / Math.max(1, data.length))
  if (rms === 0 || peak === 0) return buffer

  const scale = Math.min(targetRms / rms, ceiling / peak)
  for (let i = 0; i < data.length; i++) data[i] = (data[i] ?? 0) * scale
  return buffer
}

function renderPiano(frequencyHz: number, duration: number): AudioBuffer {
  const buffer = createRenderedBuffer(duration)
  const data = buffer.getChannelData(0)
  const sr = buffer.sampleRate
  // Slightly stretched partials and progressively quicker upper-partial decay
  // make the note read as struck strings rather than a static organ chord.
  const partials = [
    [1, 1, 1],
    [2.01, 0.48, 0.62],
    [3.03, 0.26, 0.42],
    [4.08, 0.14, 0.3],
    [5.12, 0.08, 0.22],
    [6.2, 0.045, 0.16],
  ] as const
  const fundamentalDecay = Math.max(0.72, 2.5 - frequencyHz / 520)
  for (let i = 0; i < data.length; i++) {
    const time = i / sr
    let value = 0
    for (const [ratio, amplitude, decayScale] of partials) {
      value += amplitude * Math.sin(2 * Math.PI * frequencyHz * ratio * time) * Math.exp(-time / (fundamentalDecay * decayScale))
    }
    // The very short filtered-noise-like transient supplies a felt-hammer cue.
    value += (Math.random() * 2 - 1) * 0.055 * Math.exp(-time / 0.012)
    data[i] = value
  }
  return normalize(buffer)
}

function renderBass(frequencyHz: number, duration: number): AudioBuffer {
  const buffer = createRenderedBuffer(duration)
  const data = buffer.getChannelData(0)
  const sr = buffer.sampleRate
  let lowpass = 0
  const coefficient = 1 - Math.exp((-2 * Math.PI * 1100) / sr)
  for (let i = 0; i < data.length; i++) {
    const time = i / sr
    const body = Math.sin(2 * Math.PI * frequencyHz * time) + 0.34 * Math.sin(2 * Math.PI * frequencyHz * 2 * time) + 0.12 * Math.sin(2 * Math.PI * frequencyHz * 3 * time)
    const pluck = (Math.random() * 2 - 1) * 0.16 * Math.exp(-time / 0.018)
    const envelope = (1 - Math.exp(-time / 0.006)) * (0.18 + 0.82 * Math.exp(-time / 0.8))
    lowpass += coefficient * (Math.tanh((body + pluck) * 1.18) - lowpass)
    data[i] = lowpass * envelope
  }
  return normalize(buffer)
}

function renderPluckedString(frequencyHz: number, duration: number, brightness: number): AudioBuffer {
  const buffer = createRenderedBuffer(duration)
  const data = buffer.getChannelData(0)
  const period = Math.max(2, Math.round(buffer.sampleRate / frequencyHz))
  const delay = new Float32Array(period)
  for (let i = 0; i < delay.length; i++) {
    const position = i / delay.length
    // A shaped excitation is less buzzy than white noise and captures a pick's
    // brighter attack near the bridge.
    delay[i] = (Math.random() * 2 - 1) * (0.55 + brightness * Math.sin(Math.PI * position))
  }
  const damping = 0.9945 - Math.min(0.003, frequencyHz / 300000)
  let cursor = 0
  for (let i = 0; i < data.length; i++) {
    const current = delay[cursor]!
    const next = delay[(cursor + 1) % delay.length]!
    const averaged = (current * (0.52 + brightness * 0.12) + next * (0.48 - brightness * 0.12)) * damping
    delay[cursor] = averaged
    const time = i / buffer.sampleRate
    data[i] = current * Math.exp(-time / (0.72 + brightness * 0.8))
    cursor = (cursor + 1) % delay.length
  }
  return normalize(buffer)
}

function renderOrgan(frequencyHz: number, duration: number): AudioBuffer {
  const buffer = createRenderedBuffer(duration)
  const data = buffer.getChannelData(0)
  const sr = buffer.sampleRate
  const drawbars = [
    [0.5, 0.13],
    [1, 0.9],
    [2, 0.55],
    [3, 0.32],
    [4, 0.2],
    [6, 0.13],
    [8, 0.07],
  ] as const
  for (let i = 0; i < data.length; i++) {
    const time = i / sr
    const vibrato = Math.sin(2 * Math.PI * 5.7 * time) * 0.004
    let value = 0
    for (const [ratio, amplitude] of drawbars) {
      value += amplitude * Math.sin(2 * Math.PI * frequencyHz * ratio * (time + vibrato))
    }
    const attack = Math.min(1, time / 0.012)
    const release = Math.min(1, Math.max(0, (duration - time) / 0.22))
    data[i] = value * attack * release
  }
  return normalize(buffer)
}

function renderBell(frequencyHz: number, duration: number): AudioBuffer {
  const buffer = createRenderedBuffer(duration)
  const data = buffer.getChannelData(0)
  const sr = buffer.sampleRate
  const modes = [
    [1, 0.82, 1],
    [2.71, 0.38, 0.55],
    [4.07, 0.24, 0.38],
    [5.43, 0.16, 0.28],
    [6.8, 0.1, 0.2],
    [8.93, 0.065, 0.14],
  ] as const
  for (let i = 0; i < data.length; i++) {
    const time = i / sr
    let value = 0
    for (const [ratio, amplitude, decay] of modes) {
      value += amplitude * Math.sin(2 * Math.PI * frequencyHz * ratio * time) * Math.exp(-time / (1.8 * decay))
    }
    data[i] = value * (1 - Math.exp(-time / 0.0018))
  }
  return normalize(buffer)
}

function renderGenericSynth(frequencyHz: number, patch: SynthPatch): Promise<AudioBuffer> {
  const sampleRate = 44100
  const length = Math.max(1, Math.ceil(patch.totalDurationSeconds * sampleRate))
  const ctx = new OfflineAudioContext(1, length, sampleRate)
  const envelope = ctx.createGain()
  envelope.gain.setValueAtTime(0, 0)
  envelope.gain.linearRampToValueAtTime(1, patch.attackSeconds)
  envelope.gain.linearRampToValueAtTime(patch.sustainLevel, patch.attackSeconds + patch.decaySeconds)
  const releaseStart = Math.max(patch.attackSeconds + patch.decaySeconds, patch.totalDurationSeconds - patch.releaseSeconds)
  envelope.gain.setValueAtTime(patch.sustainLevel, releaseStart)
  envelope.gain.linearRampToValueAtTime(0, patch.totalDurationSeconds)

  if (patch.lowpassHz) {
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(patch.lowpassHz * 1.25, 0)
    filter.frequency.exponentialRampToValueAtTime(Math.max(160, patch.lowpassHz * 0.62), patch.totalDurationSeconds)
    envelope.connect(filter)
    filter.connect(ctx.destination)
  } else {
    envelope.connect(ctx.destination)
  }

  const detune = patch.unisonDetuneCents ?? 0
  for (const cents of detune ? [-detune, 0, detune] : [0]) {
    const gain = ctx.createGain()
    gain.gain.value = detune ? 0.34 : 1
    const oscillator = ctx.createOscillator()
    oscillator.type = patch.waveform
    oscillator.frequency.value = frequencyHz
    oscillator.detune.value = cents
    oscillator.connect(gain)
    gain.connect(envelope)
    oscillator.start(0)
    oscillator.stop(patch.totalDurationSeconds)
  }

  if (patch.overtoneGain) {
    const overtoneGain = ctx.createGain()
    overtoneGain.gain.value = patch.overtoneGain
    const overtone = ctx.createOscillator()
    overtone.type = 'sine'
    overtone.frequency.value = frequencyHz * 2
    overtone.connect(overtoneGain)
    overtoneGain.connect(envelope)
    overtone.start(0)
    overtone.stop(patch.totalDurationSeconds)
  }
  return ctx.startRendering().then((buffer) => normalize(buffer))
}

/** Renders a preset key into a standalone buffer; acoustic voices use their own instrument-specific model. */
export async function renderSynthNote(frequencyHz: number, patch: SynthPatch): Promise<AudioBuffer> {
  switch (patch.voice) {
    case 'piano':
      return renderPiano(frequencyHz, patch.totalDurationSeconds)
    case 'bass':
      return renderBass(frequencyHz, patch.totalDurationSeconds)
    case 'pluck':
      return renderPluckedString(frequencyHz, patch.totalDurationSeconds, 0.75)
    case 'guitar':
      return renderPluckedString(frequencyHz, patch.totalDurationSeconds, 0.38)
    case 'organ':
      return renderOrgan(frequencyHz, patch.totalDurationSeconds)
    case 'bell':
      return renderBell(frequencyHz, patch.totalDurationSeconds)
    case 'lead':
    case 'pad':
      return renderGenericSynth(frequencyHz, patch)
  }
}

/**
 * Bakes a pitch shift permanently into a new buffer via an offline render.
 * Instrument keys only ascend, so the shifted source is never longer than the
 * original and the source-length render captures it in full.
 */
export async function renderPitchShiftedCopy(source: AudioBuffer, semitones: number): Promise<AudioBuffer> {
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

/**
 * Individually recorded chromatic notes from ClueSurf's Wavebase, which
 * dedicates its audio files to the public domain. They are intentionally kept
 * remote rather than bundled: this adds real electric-guitar articulation
 * without turning a small web instrument into a multi-megabyte initial load.
 */
const WAVEBASE_GUITAR_BASE_URL = 'https://raw.githubusercontent.com/cluesurf/wavebase/make/base/guitar/'
const WAVEBASE_GUITAR_NOTE_FILES = [
  'string-4-E-as-E3.wav',
  'string-4-F-as-F3.wav',
  'string-4-Fx-as-Fx3.wav',
  'string-3-G-as-G3.wav',
  'string-3-Gx-as-Gx3.wav',
  'string-3-A-as-A3.wav',
  'string-3-Ax-as-Ax3.wav',
  'string-2-B-as-B3.wav',
  'string-2-C-as-C4.wav',
  'string-2-Cx-as-Cx4.wav',
  'string-2-D-as-D4.wav',
  'string-2-Dx-as-Dx4.wav',
  'string-1-E-as-E4.wav',
  'string-1-F-as-F4.wav',
  'string-1-Fx-as-Fx4.wav',
  'string-1-G-as-G4.wav',
] as const

async function decodeRemoteAudio(url: string): Promise<AudioBuffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load guitar sample (${response.status})`)
  const audioData = await response.arrayBuffer()
  const decoder = new OfflineAudioContext(1, 1, 44100)
  return normalize(await decoder.decodeAudioData(audioData))
}

async function buildRecordedGuitarKeys(): Promise<AudioBuffer[]> {
  return Promise.all(WAVEBASE_GUITAR_NOTE_FILES.map((file) => decodeRemoteAudio(`${WAVEBASE_GUITAR_BASE_URL}${file}`)))
}

export async function buildInstrumentKeysFromPreset(preset: InstrumentPreset): Promise<AudioBuffer[]> {
  if (preset.patch.voice === 'guitar') {
    try {
      return await buildRecordedGuitarKeys()
    } catch (error) {
      // A picker must never be unusable because a third-party host is offline.
      console.warn('Real guitar samples unavailable; using the built-in guitar model.', error)
    }
  }

  return Promise.all(semitoneOffsets().map((semitones) => renderSynthNote(preset.rootHz * Math.pow(2, semitones / 12), preset.patch)))
}

export async function buildInstrumentKeysFromRecording(rootBuffer: AudioBuffer): Promise<AudioBuffer[]> {
  return Promise.all(semitoneOffsets().map((semitones) => renderPitchShiftedCopy(rootBuffer, semitones)))
}
