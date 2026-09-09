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
  /** Slow, deterministic movement baked into each key so sustained notes breathe. */
  vibratoHz?: number
  vibratoCents?: number
  /** Fraction of lowpass frequency used as the filter LFO depth. */
  filterMovement?: number
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
  // 16' through 1' drawbars: the upper harmonics carry enough bite to stay
  // intelligible in a mix, while the sub octave supplies real body.
  const drawbars = [
    [0.5, 0.16], [1, 0.88], [2, 0.53], [3, 0.29],
    [4, 0.19], [5, 0.09], [6, 0.12], [8, 0.07],
  ] as const
  for (let i = 0; i < data.length; i++) {
    const time = i / sr
    // A slow Leslie-like swell plus a faster gentle pitch wobble gives held
    // chords motion without making individual notes sound out of tune.
    const vibrato = Math.sin(2 * Math.PI * 5.8 * time) * 0.0035
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

function renderBell(frequencyHz: number, duration: number): AudioBuffer {
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

function semitoneOffsets(): number[] {
  return Array.from({ length: INSTRUMENT_KEY_COUNT }, (_, i) => i)
}

/**
 * CC0 electric-guitar zones sourced from Karoryfer's Black And Green Guitars
 * pack (repackaged as individually trimmed WAVs by MAESTRO String Studio).
 * Three root notes cover the Mini Mixer's E3–G4 range: adjacent pads are
 * derived from the nearest recording, avoiding the artificial 'one sample
 * stretched across an entire neck' sound while keeping the first use compact.
 *
 * Source: https://huggingface.co/AEmotionStudio/stringstudio-electric-guitar-samples
 * License: CC0-1.0.
 */
const CC0_ELECTRIC_GUITAR_BASE_URL =
  'https://huggingface.co/AEmotionStudio/stringstudio-electric-guitar-samples/resolve/main/samples/'
const RECORDED_GUITAR_ZONES = [
  { midi: 52, file: '52_v100_rr1.wav' }, // E3
  { midi: 59, file: '59_v100_rr1.wav' }, // B3
  { midi: 67, file: '67_v100_rr1.wav' }, // G4
] as const
const GUITAR_ROOT_MIDI = 52
let recordedGuitarKeysPromise: Promise<AudioBuffer[]> | null = null

async function decodeRemoteAudio(url: string): Promise<AudioBuffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not load guitar sample (${response.status})`)
  const audioData = await response.arrayBuffer()
  const decoder = new OfflineAudioContext(1, 1, 44100)
  return normalize(await decoder.decodeAudioData(audioData))
}

function closestGuitarZone(targetMidi: number) {
  return RECORDED_GUITAR_ZONES.reduce((closest, zone) =>
    Math.abs(zone.midi - targetMidi) < Math.abs(closest.midi - targetMidi) ? zone : closest,
  )
}

function buildRecordedGuitarKeys(): Promise<AudioBuffer[]> {
  if (!recordedGuitarKeysPromise) {
    recordedGuitarKeysPromise = (async () => {
      // Fetch each source recording once, then derive the adjacent frets locally.
      const sourceBuffers = await Promise.all(
        RECORDED_GUITAR_ZONES.map(async (zone) => [
          zone.midi,
          await decodeRemoteAudio(`${CC0_ELECTRIC_GUITAR_BASE_URL}${zone.file}`),
        ] as const),
      )
      const byMidi = new Map(sourceBuffers)

      return Promise.all(
        semitoneOffsets().map(async (semitones) => {
          const targetMidi = GUITAR_ROOT_MIDI + semitones
          const zone = closestGuitarZone(targetMidi)
          const source = byMidi.get(zone.midi)
          if (!source) throw new Error('Missing decoded guitar source zone')
          return normalize(await renderPitchShiftedCopy(source, targetMidi - zone.midi))
        }),
      )
    })().catch((error: unknown) => {
      // Do not cache a temporary network failure: a later picker open can retry.
      recordedGuitarKeysPromise = null
      throw error
    })
  }

  return recordedGuitarKeysPromise
}


/**
 * CC0 fingered-bass zones from Karoryfer's Growlybass pack, prepared as
 * browser-decodable WAVs by MAESTRO String Studio. C2–D#3 is covered by the
 * nearest of three notes, retaining real pluck, fret, and finger character.
 */
const CC0_BASS_BASE_URL =
  'https://huggingface.co/AEmotionStudio/stringstudio-bass-samples/resolve/main/samples/'
const RECORDED_BASS_ZONES = [
  { midi: 37, file: '37_v100_rr1.wav' }, // C#2
  { midi: 45, file: '45_v100_rr1.wav' }, // A2
  { midi: 52, file: '52_v100_rr1.wav' }, // E3
] as const
const BASS_ROOT_MIDI = 36
let recordedBassKeysPromise: Promise<AudioBuffer[]> | null = null

function closestBassZone(targetMidi: number) {
  return RECORDED_BASS_ZONES.reduce((closest, zone) =>
    Math.abs(zone.midi - targetMidi) < Math.abs(closest.midi - targetMidi) ? zone : closest,
  )
}

function buildRecordedBassKeys(): Promise<AudioBuffer[]> {
  if (!recordedBassKeysPromise) {
    recordedBassKeysPromise = (async () => {
      const sourceBuffers = await Promise.all(
        RECORDED_BASS_ZONES.map(async (zone) => [
          zone.midi,
          await decodeRemoteAudio(`${CC0_BASS_BASE_URL}${zone.file}`),
        ] as const),
      )
      const byMidi = new Map(sourceBuffers)

      return Promise.all(
        semitoneOffsets().map(async (semitones) => {
          const targetMidi = BASS_ROOT_MIDI + semitones
          const zone = closestBassZone(targetMidi)
          const source = byMidi.get(zone.midi)
          if (!source) throw new Error('Missing decoded bass source zone')
          return normalize(await renderPitchShiftedCopy(source, targetMidi - zone.midi))
        }),
      )
    })().catch((error: unknown) => {
      recordedBassKeysPromise = null
      throw error
    })
  }

  return recordedBassKeysPromise
}

export async function buildInstrumentKeysFromPreset(preset: InstrumentPreset): Promise<AudioBuffer[]> {
  try {
    if (preset.patch.voice === 'guitar') return await buildRecordedGuitarKeys()
    if (preset.patch.voice === 'bass') return await buildRecordedBassKeys()
  } catch (error) {
    // A picker must never be unusable because a third-party host is offline.
    console.warn(`Recorded ${preset.name} samples unavailable; using the built-in model.`, error)
  }

  return Promise.all(semitoneOffsets().map((semitones) => renderSynthNote(preset.rootHz * Math.pow(2, semitones / 12), preset.patch)))
}

export async function buildInstrumentKeysFromRecording(rootBuffer: AudioBuffer): Promise<AudioBuffer[]> {
  return Promise.all(semitoneOffsets().map((semitones) => renderPitchShiftedCopy(rootBuffer, semitones)))
}
