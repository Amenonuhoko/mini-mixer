import { RECORDED_KEYS } from './recordedKeys'
import { queuedRender } from './renderQueue'
import { polishSample } from './samplePolish'

export type SynthWaveform = OscillatorType
type InstrumentVoice = 'piano' | 'bass' | 'lead' | 'pad' | 'pluck' | 'organ' | 'bell' | 'guitar' | 'electricPiano' | 'mallet' | 'sub' | 'rubber' | 'bubble'

/** A real sampled wind source, fetched only when its layout is selected. */
export type RecordedWindPack = 'altoSaxophone' | 'trumpet' | 'flute' | 'clarinet'

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
  /** Slow, deterministic movement baked into each key so sustained notes breathe. */
  vibratoHz?: number
  vibratoCents?: number
  /** Fraction of lowpass frequency used as the filter LFO depth. */
  filterMovement?: number
}

export interface InstrumentPreset {
  name: string
  /** Frequency of key 0 (the root); each subsequent key is one semitone higher. */
  description?: string
  recordedKeys?: keyof typeof RECORDED_KEYS
  rootHz: number
  /** A real CC0 wind pack; download errors leave the existing bank unchanged. */
  recordedWindPack?: RecordedWindPack
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
    description: 'Recorded Steinway grand: felt hammer attack and natural string decay.',
    recordedKeys: 'piano',
    rootHz: 261.63,
    patch: {
      voice: 'piano',
      waveform: 'triangle',
      attackSeconds: 0.003,
      decaySeconds: 0.8,
      sustainLevel: 0,
      releaseSeconds: 1.8,
      totalDurationSeconds: 3.4,
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
      totalDurationSeconds: 1.35,
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
      totalDurationSeconds: 1.45,
      lowpassHz: 3600,
      vibratoHz: 5.2,
      vibratoCents: 12,
      filterMovement: 0.16,
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
      totalDurationSeconds: 4.6,
      lowpassHz: 1900,
      vibratoHz: 0.19,
      vibratoCents: 7,
      filterMovement: 0.32,
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
      totalDurationSeconds: 1.55,
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
      totalDurationSeconds: 2.4,
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
      totalDurationSeconds: 4.6,
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
      totalDurationSeconds: 2.6,
      lowpassHz: 3400,
    },
  },
  {
    name: 'Alto Saxophone', rootHz: 164.81, recordedWindPack: 'altoSaxophone',
    patch: { voice: 'lead', waveform: 'sawtooth', overtoneGain: 0.12, unisonDetuneCents: 5, attackSeconds: 0.045, decaySeconds: 0.22, sustainLevel: 0.72, releaseSeconds: 0.5, totalDurationSeconds: 2.8, lowpassHz: 2400, vibratoHz: 5.1, vibratoCents: 10, filterMovement: 0.08 },
  },
  {
    name: 'Trumpet', rootHz: 261.63, recordedWindPack: 'trumpet',
    patch: { voice: 'lead', waveform: 'sawtooth', overtoneGain: 0.2, unisonDetuneCents: 4, attackSeconds: 0.03, decaySeconds: 0.16, sustainLevel: 0.64, releaseSeconds: 0.38, totalDurationSeconds: 2.4, lowpassHz: 3300, vibratoHz: 5.4, vibratoCents: 8, filterMovement: 0.1 },
  },
  {
    name: 'Flute', rootHz: 261.63, recordedWindPack: 'flute',
    patch: { voice: 'lead', waveform: 'sine', overtoneGain: 0.08, attackSeconds: 0.07, decaySeconds: 0.2, sustainLevel: 0.7, releaseSeconds: 0.62, totalDurationSeconds: 3, lowpassHz: 4100, vibratoHz: 5.3, vibratoCents: 7, filterMovement: 0.06 },
  },
  {
    name: 'Clarinet', rootHz: 130.81, recordedWindPack: 'clarinet',
    patch: { voice: 'lead', waveform: 'square', overtoneGain: 0.07, attackSeconds: 0.055, decaySeconds: 0.18, sustainLevel: 0.68, releaseSeconds: 0.48, totalDurationSeconds: 2.7, lowpassHz: 2500, vibratoHz: 4.9, vibratoCents: 6, filterMovement: 0.06 },
  },
  { name: 'Electric Piano', description: 'Soft tines with a warm bell attack', rootHz: 261.63, patch: { voice: 'electricPiano', waveform: 'sine', attackSeconds: .004, decaySeconds: .7, sustainLevel: 0, releaseSeconds: .5, totalDurationSeconds: 2.6 } },
  { name: 'Marimba', recordedKeys: 'marimba', description: 'Rounded wooden mallets', rootHz: 261.63, patch: { voice: 'mallet', waveform: 'sine', attackSeconds: .002, decaySeconds: .4, sustainLevel: 0, releaseSeconds: .2, totalDurationSeconds: 1.3 } },
  { name: 'Sub Bass', description: 'Deep, clean low end with a gentle harmonic', rootHz: 65.41, patch: { voice: 'sub', waveform: 'sine', attackSeconds: .008, decaySeconds: .2, sustainLevel: .7, releaseSeconds: .2, totalDurationSeconds: .95 } },
  { name: 'Velvet Strings', description: 'Slow bowed synth ensemble', rootHz: 261.63, patch: { voice: 'pad', waveform: 'sawtooth', unisonDetuneCents: 7, attackSeconds: .22, decaySeconds: .4, sustainLevel: .55, releaseSeconds: .9, totalDurationSeconds: 3.1, lowpassHz: 2600, vibratoHz: 4.7, vibratoCents: 4 } },
  { name: 'Chiptune', description: 'Bright square-wave arcade notes', rootHz: 261.63, patch: { voice: 'lead', waveform: 'square', attackSeconds: .003, decaySeconds: .12, sustainLevel: .28, releaseSeconds: .12, totalDurationSeconds: .65, lowpassHz: 5200 } },
  { name: 'Rubber Duck', description: 'A springy, nasal quack with a pitched body', rootHz: 261.63, patch: { voice: 'rubber', waveform: 'sine', attackSeconds: .004, decaySeconds: .2, sustainLevel: 0, releaseSeconds: .15, totalDurationSeconds: .85 } },
  { name: 'Bubble Keys', description: 'Bouncy water-drop notes and glassy tails', rootHz: 261.63, patch: { voice: 'bubble', waveform: 'sine', attackSeconds: .003, decaySeconds: .3, sustainLevel: 0, releaseSeconds: .2, totalDurationSeconds: 1.25 } },
]

function createRenderedBuffer(durationSeconds: number): AudioBuffer {
  const sampleRate = 44100
  return new AudioBuffer({ numberOfChannels: 1, length: Math.max(1, Math.ceil(durationSeconds * sampleRate)), sampleRate })
}

/**
 * Sets a consistent RMS level for every rendered key. Peak-only limiting lets
 * quiet sustained sounds and transient-heavy sounds feel radically different;
 * RMS normalisation brings their usable level together, while the ceiling
 * preserves headroom and prevents boosted renderings from clipping.
 */
const normalize = polishSample

async function renderPiano(frequencyHz: number, duration: number): Promise<AudioBuffer> {
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
    if (i > 0 && i % 8192 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0))
    const time = i / sr
    let value = 0
    for (const [ratio, amplitude, decayScale] of partials) {
      if (frequencyHz * ratio >= sr * 0.45) continue
      value += amplitude * Math.sin(2 * Math.PI * frequencyHz * ratio * time) * Math.exp(-time / (fundamentalDecay * decayScale))
    }
    // The very short filtered-noise-like transient supplies a felt-hammer cue.
    value += (Math.random() * 2 - 1) * 0.055 * Math.exp(-time / 0.012)
    data[i] = value
  }
  return normalize(buffer)
}

async function renderBass(frequencyHz: number, duration: number): Promise<AudioBuffer> {
  const buffer = createRenderedBuffer(duration)
  const data = buffer.getChannelData(0)
  const sr = buffer.sampleRate
  let lowpass = 0
  const coefficient = 1 - Math.exp((-2 * Math.PI * 1100) / sr)
  for (let i = 0; i < data.length; i++) {
    if (i > 0 && i % 8192 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0))
    const time = i / sr
    const body = Math.sin(2 * Math.PI * frequencyHz * time) + 0.34 * Math.sin(2 * Math.PI * frequencyHz * 2 * time) + 0.12 * Math.sin(2 * Math.PI * frequencyHz * 3 * time)
    const pluck = (Math.random() * 2 - 1) * 0.16 * Math.exp(-time / 0.018)
    const envelope = (1 - Math.exp(-time / 0.006)) * (0.18 + 0.82 * Math.exp(-time / 0.8))
    lowpass += coefficient * (Math.tanh((body + pluck) * 1.18) - lowpass)
    data[i] = lowpass * envelope
  }
  return normalize(buffer)
}

async function renderPluckedString(frequencyHz: number, duration: number, brightness: number): Promise<AudioBuffer> {
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
    if (i > 0 && i % 8192 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0))
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

async function renderOrgan(frequencyHz: number, duration: number): Promise<AudioBuffer> {
  const buffer = createRenderedBuffer(duration)
  const data = buffer.getChannelData(0)
  const sr = buffer.sampleRate
  // 16' through 1' drawbars: the upper harmonics carry enough bite to stay
  // intelligible in a mix, while the sub octave supplies real body.
  const drawbars = [
    [0.5, 0.16], [1, 0.88], [2, 0.53], [3, 0.29],
    [4, 0.19], [5, 0.09], [6, 0.12], [8, 0.07],
  ] as const
  for (let i = 0; i < data.length; i++) {
    if (i > 0 && i % 8192 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0))
    const time = i / sr
    // A slow Leslie-like swell plus a faster gentle pitch wobble gives held
    // chords motion without making individual notes sound out of tune.
    const vibrato = Math.sin(2 * Math.PI * 5.8 * time) * (0.0035 / (2 * Math.PI * 5.8))
    const rotary = 0.88 + 0.12 * Math.sin(2 * Math.PI * 0.74 * time)
    let value = 0
    for (const [ratio, amplitude] of drawbars) {
      value += amplitude * Math.sin(2 * Math.PI * frequencyHz * ratio * (time + vibrato))
    }
    const percussion = Math.sin(2 * Math.PI * frequencyHz * 4 * time) * 0.18 * Math.exp(-time / 0.09)
    const keyClick = (Math.random() * 2 - 1) * 0.018 * Math.exp(-time / 0.006)
    const attack = Math.min(1, time / 0.012)
    const release = Math.min(1, Math.max(0, (duration - time) / 0.24))
    data[i] = (value + percussion + keyClick) * attack * release * rotary
  }
  return normalize(buffer)
}

async function renderBell(frequencyHz: number, duration: number): Promise<AudioBuffer> {
  const buffer = createRenderedBuffer(duration)
  const data = buffer.getChannelData(0)
  const sr = buffer.sampleRate
  // Inharmonic modes decay independently; the short strike noise prevents
  // this from reading as a clean FM tone.
  const modes = [
    [1, 0.82, 1], [2.71, 0.38, 0.55], [4.07, 0.24, 0.38],
    [5.43, 0.16, 0.28], [6.8, 0.1, 0.2], [8.93, 0.065, 0.14],
  ] as const
  for (let i = 0; i < data.length; i++) {
    if (i > 0 && i % 8192 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0))
    const time = i / sr
    let value = 0
    for (const [ratio, amplitude, decay] of modes) {
      const phase = ratio * 0.17
      value += amplitude * Math.sin(2 * Math.PI * frequencyHz * ratio * time + phase) * Math.exp(-time / (2.15 * decay))
    }
    const strike = (Math.random() * 2 - 1) * 0.045 * Math.exp(-time / 0.009)
    data[i] = (value + strike) * (1 - Math.exp(-time / 0.0018))
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

  let filter: BiquadFilterNode | null = null
  if (patch.lowpassHz) {
    filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(patch.lowpassHz * 1.25, 0)
    filter.frequency.exponentialRampToValueAtTime(Math.max(160, patch.lowpassHz * 0.62), patch.totalDurationSeconds)
    envelope.connect(filter)
    filter.connect(ctx.destination)
  } else {
    envelope.connect(ctx.destination)
  }

  // Use one deterministic LFO for every oscillator in the patch. It gives lead
  // a restrained player-like vibrato and lets Pad evolve while it sustains.
  let vibratoGain: GainNode | null = null
  let vibrato: OscillatorNode | null = null
  if (patch.vibratoHz && patch.vibratoCents) {
    vibrato = ctx.createOscillator()
    vibrato.type = 'sine'
    vibrato.frequency.value = patch.vibratoHz
    vibratoGain = ctx.createGain()
    vibratoGain.gain.value = patch.vibratoCents
    vibrato.connect(vibratoGain)
    vibrato.start(0)
    vibrato.stop(patch.totalDurationSeconds)
  }

  if (filter && patch.filterMovement) {
    const filterLfo = ctx.createOscillator()
    const filterLfoGain = ctx.createGain()
    filterLfo.type = 'sine'
    filterLfo.frequency.value = patch.voice === 'pad' ? 0.13 : 1.8
    filterLfoGain.gain.value = (patch.lowpassHz ?? 0) * patch.filterMovement
    filterLfo.connect(filterLfoGain)
    filterLfoGain.connect(filter.frequency)
    filterLfo.start(0)
    filterLfo.stop(patch.totalDurationSeconds)
  }

  const detune = patch.unisonDetuneCents ?? 0
  for (const cents of detune ? [-detune, 0, detune] : [0]) {
    const gain = ctx.createGain()
    gain.gain.value = detune ? 0.34 : 1
    const oscillator = ctx.createOscillator()
    oscillator.type = patch.waveform
    oscillator.frequency.value = frequencyHz
    oscillator.detune.value = cents
    if (vibratoGain) vibratoGain.connect(oscillator.detune)
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
    if (vibratoGain) vibratoGain.connect(overtone.detune)
    overtone.connect(overtoneGain)
    overtoneGain.connect(envelope)
    overtone.start(0)
    overtone.stop(patch.totalDurationSeconds)
  }

  return ctx.startRendering().then((buffer) => normalize(buffer))
}


/** Small pre-rendered models: no oscillators or modulation run during playback. */
async function renderCharacter(hz: number, patch: SynthPatch): Promise<AudioBuffer> {
  const buffer = createRenderedBuffer(patch.totalDurationSeconds)
  const data = buffer.getChannelData(0)
  let phase = 0
  for (let i = 0; i < data.length; i++) {
    if (i > 0 && i % 8192 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0))
    const t = i / buffer.sampleRate
    const bend = patch.voice === 'bubble' ? 1 + .5 * Math.exp(-t * 35) : patch.voice === 'rubber' ? 1 + .16 * Math.exp(-t * 22) : 1
    phase += 2 * Math.PI * hz * bend / buffer.sampleRate
    let value = 0
    if (patch.voice === 'electricPiano') value = Math.sin(phase + 1.4 * Math.exp(-t * 8) * Math.sin(phase * 2)) * Math.exp(-t * 1.8) + .12 * Math.sin(phase * 3) * Math.exp(-t * 6)
    if (patch.voice === 'mallet') value = Math.sin(phase) * Math.exp(-t * 5) + .32 * Math.sin(phase * 4) * Math.exp(-t * 16) + .07 * Math.sin(phase * 9.2) * Math.exp(-t * 35)
    if (patch.voice === 'sub') value = (Math.sin(phase) + .12 * Math.sin(phase * 2)) * (1 - Math.exp(-t * 150)) * Math.exp(-t * 2.5)
    if (patch.voice === 'rubber') value = Math.sin(phase + 2 * Math.exp(-t * 5) * Math.sin(phase * 2)) * (1 - Math.exp(-t * 200)) * Math.exp(-t * 6)
    if (patch.voice === 'bubble') value = (Math.sin(phase) + .18 * Math.sin(phase * 2.76) * Math.exp(-t * 10)) * Math.exp(-t * 5)
    data[i] = value
  }
  return normalize(buffer)
}

/** Renders a preset key into a standalone buffer; acoustic voices use their own instrument-specific model. */
export async function renderSynthNote(frequencyHz: number, patch: SynthPatch): Promise<AudioBuffer> {
  switch (patch.voice) {
    case 'electricPiano':
    case 'mallet':
    case 'sub':
    case 'rubber':
    case 'bubble':
      return renderCharacter(frequencyHz, patch)
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
 * Downward shifts need a longer render than their source so their release is
 * never cut short; upward shifts retain the source-length capture behavior.
 */
export async function renderPitchShiftedCopy(source: AudioBuffer, semitones: number): Promise<AudioBuffer> {
  if (semitones === 0) return source
  const playbackRate = Math.pow(2, semitones / 12)
  const renderLength = Math.max(1, Math.ceil(source.length / playbackRate))
  const ctx = new OfflineAudioContext(source.numberOfChannels, renderLength, source.sampleRate)
  const bufferSource = ctx.createBufferSource()
  bufferSource.buffer = source
  bufferSource.detune.value = semitones * 100
  bufferSource.connect(ctx.destination)
  bufferSource.start(0)
  return ctx.startRendering()
}

/**
 * CC0 electric-guitar zones sourced from Karoryfer's Black And Green Guitars
 * pack (repackaged as individually trimmed WAVs by MAESTRO String Studio).
 * Every note is derived from the nearest recording, avoiding the artificial
 * 'one sample stretched across an entire neck' sound.
 *
 * Source: https://huggingface.co/AEmotionStudio/stringstudio-electric-guitar-samples
 * License: CC0-1.0.
 */
const CC0_ELECTRIC_GUITAR_BASE_URL =
  'https://huggingface.co/AEmotionStudio/stringstudio-electric-guitar-samples/resolve/main/samples/'
const RECORDED_GUITAR_ZONES: RecordedSourceZone[] = [
  { midi: 52, file: '52_v100_rr1.wav' }, // E3
  { midi: 59, file: '59_v100_rr1.wav' }, // B3
  { midi: 67, file: '67_v100_rr1.wav' }, // G4
]

/**
 * CC0 fingered-bass zones from Karoryfer's Growlybass pack, prepared as
 * browser-decodable WAVs by MAESTRO String Studio, retaining real pluck,
 * fret, and finger character.
 */
const CC0_BASS_BASE_URL =
  'https://huggingface.co/AEmotionStudio/stringstudio-bass-samples/resolve/main/samples/'
const RECORDED_BASS_ZONES: RecordedSourceZone[] = [
  { midi: 37, file: '37_v100_rr1.wav' }, // C#2
  { midi: 45, file: '45_v100_rr1.wav' }, // A2
  { midi: 52, file: '52_v100_rr1.wav' }, // E3
]

/**
 * Real CC0 multisample sources: Weresax provides the alto recordings; the
 * remaining packs are VSCO-derived wind zones. Only the zones nearest the
 * requested notes are fetched, cached, and locally pitch-rendered.
 */
type RecordedSourceZone = { midi: number; file: string }
type StaticWindPack = { baseUrl: string; zones: readonly RecordedSourceZone[] }
type ManifestWindPack = { baseUrl: string; manifestUrl: string }
type WindPackDefinition = StaticWindPack | ManifestWindPack

const CC0_WIND_PACKS: Record<RecordedWindPack, WindPackDefinition> = {
  altoSaxophone: {
    baseUrl: 'https://raw.githubusercontent.com/sfzinstruments/karoryfer.weresax/master/Samples/alto/',
    zones: [
      { midi: 52, file: 'e2_f_rr1_cnd.wav' }, { midi: 60, file: 'c3_f_rr1_cnd.wav' },
      { midi: 68, file: 'ab3_f_rr1_cnd.wav' }, { midi: 76, file: 'e4_f_rr1_cnd.wav' },
    ],
  },
  trumpet: { baseUrl: 'https://huggingface.co/AEmotionStudio/windstudio-trumpet-samples/resolve/main/', manifestUrl: 'https://huggingface.co/AEmotionStudio/windstudio-trumpet-samples/resolve/main/manifest.json' },
  flute: { baseUrl: 'https://huggingface.co/AEmotionStudio/windstudio-flute-samples/resolve/main/', manifestUrl: 'https://huggingface.co/AEmotionStudio/windstudio-flute-samples/resolve/main/manifest.json' },
  clarinet: { baseUrl: 'https://huggingface.co/AEmotionStudio/windstudio-clarinet-samples/resolve/main/', manifestUrl: 'https://huggingface.co/AEmotionStudio/windstudio-clarinet-samples/resolve/main/manifest.json' },
}

function isStaticWindPack(pack: WindPackDefinition): pack is StaticWindPack { return 'zones' in pack }
function parseWindZones(value: unknown): RecordedSourceZone[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { zones?: unknown }).zones)) throw new Error('Invalid wind sample manifest')
  const zones = ((value as { zones: unknown[] }).zones).flatMap((zone): RecordedSourceZone[] => {
    if (!zone || typeof zone !== 'object') return []
    const item = zone as { file?: unknown; rootPitch?: unknown }
    return typeof item.file === 'string' && typeof item.rootPitch === 'number' ? [{ file: item.file, midi: item.rootPitch }] : []
  })
  if (zones.length === 0) throw new Error('Wind sample manifest contains no playable zones')
  return zones
}
function windFileUrl(baseUrl: string, file: string): string {
  return /^https?:\/\//.test(file) ? file : `${baseUrl}${file.replace(/^\.\//, '')}`
}

async function decodeRemoteAudio(url: string): Promise<AudioBuffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`Could not load recorded sample (${response.status})`)
  const audioData = await response.arrayBuffer()
  const decoder = new OfflineAudioContext(1, 1, 44100)
  return normalize(await decoder.decodeAudioData(audioData))
}

/** Fetch-once caches; a failure is dropped from the cache so a later build can retry. */
const zoneBufferCache = new Map<string, Promise<AudioBuffer>>()
const zoneListCache = new Map<string, Promise<RecordedSourceZone[]>>()

function cached<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit) return hit
  const task = load().catch((error: unknown) => {
    cache.delete(key)
    throw error
  })
  cache.set(key, task)
  return task
}

interface RecordedSource {
  zones: readonly RecordedSourceZone[]
  url: (file: string) => string
}

export function usesRecordings(preset: InstrumentPreset): boolean {
  return !!preset.recordedKeys || !!preset.recordedWindPack || preset.patch.voice === 'guitar' || preset.patch.voice === 'bass'
}

async function recordedSourceFor(preset: InstrumentPreset): Promise<RecordedSource | null> {
  if (preset.recordedKeys) return { zones: RECORDED_KEYS[preset.recordedKeys], url: (file) => import.meta.env.BASE_URL + 'instruments/' + file }
  if (preset.recordedWindPack) {
    const pack = CC0_WIND_PACKS[preset.recordedWindPack]
    const zones = isStaticWindPack(pack)
      ? pack.zones
      : await cached(zoneListCache, pack.manifestUrl, async () => {
          const response = await fetch(pack.manifestUrl, { signal: AbortSignal.timeout(15000) })
          if (!response.ok) throw new Error(`Could not load wind sample manifest (${response.status})`)
          return parseWindZones(await response.json())
        })
    return { zones, url: (file) => windFileUrl(pack.baseUrl, file) }
  }
  if (preset.patch.voice === 'guitar') return { zones: RECORDED_GUITAR_ZONES, url: (file) => CC0_ELECTRIC_GUITAR_BASE_URL + file }
  if (preset.patch.voice === 'bass') return { zones: RECORDED_BASS_ZONES, url: (file) => CC0_BASS_BASE_URL + file }
  return null
}

function nearestZone(targetMidi: number, zones: readonly RecordedSourceZone[]): RecordedSourceZone {
  return zones.reduce((best, zone) => (Math.abs(zone.midi - targetMidi) < Math.abs(best.midi - targetMidi) ? zone : best))
}

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/**
 * Renders one buffer per requested MIDI note in a preset's voice. Presets with
 * Real recordings pitch the nearest zone. Intentionally synthetic voices use
 * the built-in model; unavailable recordings are reported instead of substituted.
 */
export async function renderPresetNotes(preset: InstrumentPreset, midis: number[]): Promise<Map<number, AudioBuffer>> {
  const unique = [...new Set(midis)]
  try {
    const recorded = await recordedSourceFor(preset)
    if (recorded) {
      return new Map(
        await Promise.all(
          unique.map((midi) => queuedRender(async () => {
            const zone = nearestZone(midi, recorded.zones)
            const url = recorded.url(zone.file)
            const source = await cached(zoneBufferCache, url, () => decodeRemoteAudio(url))
            return [midi, midi === zone.midi ? source : normalize(await renderPitchShiftedCopy(source, midi - zone.midi))] as const
          })),
        ),
      )
    }
  } catch (error) {
    throw new Error(`Could not load the real ${preset.name} recordings. Check your connection and retry; your current sound has been kept.`, { cause: error })
  }
  return new Map(
    await Promise.all(unique.map((midi) => queuedRender(async () => [midi, await renderSynthNote(midiToFrequency(midi), preset.patch)] as const))),
  )
}

/** Renders one buffer per requested MIDI note from a user recording, treating the recording as middle C. */
export async function renderRecordingNotes(root: AudioBuffer, midis: number[], rootMidi = 60): Promise<Map<number, AudioBuffer>> {
  const unique = [...new Set(midis)]
  return new Map(await Promise.all(unique.map((midi) => queuedRender(async () => [midi, await renderPitchShiftedCopy(root, midi - rootMidi)] as const))))
}

/** Sums buffers (a chord's notes) into one mono buffer as long as the longest, then levels it like any other key. */
export function mixBuffers(buffers: AudioBuffer[]): AudioBuffer {
  const first = buffers[0]!
  const length = Math.max(...buffers.map((buffer) => buffer.length))
  const ctx = new OfflineAudioContext(1, 1, first.sampleRate)
  const mixed = ctx.createBuffer(1, length, first.sampleRate)
  const out = mixed.getChannelData(0)
  for (const buffer of buffers) {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
    for (let i = 0; i < buffer.length; i++) {
      let sum = 0
      for (const channel of channels) sum += channel[i] ?? 0
      out[i] = (out[i] ?? 0) + sum / channels.length
    }
  }
  return normalize(mixed)
}
