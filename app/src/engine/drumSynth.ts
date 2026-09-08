/**
 * Temporary pad layouts for percussion. Acoustic Drums and Cymbals & Metal
 * use a CC0 recorded kit; the other two layouts remain deliberately focused
 * synthetic instruments rather than pretending one generic noise source is a
 * full drum set.
 *
 * Recorded source: Virtuosity Drums (CC0 1.0), prepared by ferrosintesis.
 * https://github.com/0x4D44/ferrosintesis/tree/main/crates/ferrosintesis-samples-drumkit
 */
export type DrumVoiceKind =
  | 'kick' | 'snare' | 'hihat' | 'tom' | 'ride' | 'crash' | 'china'
  | 'clap' | 'rim' | 'cowbell' | 'shaker' | 'tambourine' | 'claves' | 'conga' | 'bongo'

export interface DrumVoice {
  name: string
  kind: DrumVoiceKind
  decaySeconds: number
  freqHz?: number
  filterHz?: number
  /** A real, licensed recording to prefer over the synthesis fallback. */
  recordedFile?: string
  recordedBank?: 'core' | 'cymbals'
}

export interface DrumKitPreset {
  id: 'acoustic-drums' | 'cymbals-metal' | 'hand-percussion' | 'electronic-drums'
  name: string
  voices: DrumVoice[]
}

const CORE = 'https://raw.githubusercontent.com/0x4D44/ferrosintesis/main/crates/ferrosintesis-samples-drumkit/samples/'
const CYMBALS = 'https://raw.githubusercontent.com/0x4D44/ferrosintesis/main/crates/ferrosintesis-samples-drumkit2/samples/'

export const DRUM_KITS: DrumKitPreset[] = [
  {
    id: 'acoustic-drums',
    name: 'Acoustic Drums',
    voices: [
      { name: 'Kick', kind: 'kick', decaySeconds: .7, recordedFile: 'kick_vl4_rr1.flac', recordedBank: 'core' },
      { name: 'Snare', kind: 'snare', decaySeconds: .45, recordedFile: 'snare_vl5_rr1.flac', recordedBank: 'core' },
      { name: 'Side Stick', kind: 'claves', decaySeconds: .12, recordedFile: 'sidestick_vl3_rr1.flac', recordedBank: 'core' },
      { name: 'Closed Hat', kind: 'hihat', decaySeconds: .16, recordedFile: 'hhc_vl4_rr1.flac', recordedBank: 'core' },
      { name: 'Pedal Hat', kind: 'hihat', decaySeconds: .28, recordedFile: 'hhp_vl3_rr1.flac', recordedBank: 'core' },
      { name: 'Open Hat', kind: 'hihat', decaySeconds: .8, recordedFile: 'hho_vl3_rr1.flac', recordedBank: 'core' },
      { name: 'High Tom', kind: 'tom', decaySeconds: .55, recordedFile: 'tomhi_vl3_rr1.flac', recordedBank: 'core' },
      { name: 'Floor Tom', kind: 'tom', decaySeconds: .75, recordedFile: 'tomlo_vl3_rr1.flac', recordedBank: 'core' },
      { name: 'Ride Bow', kind: 'ride', decaySeconds: 1.5, recordedFile: 'ride_vl3_rr1.flac', recordedBank: 'core' },
      { name: 'Ride Bell', kind: 'ride', decaySeconds: 1.8, recordedFile: 'ridebell_vl3_rr1.flac', recordedBank: 'core' },
    ],
  },
  {
    id: 'cymbals-metal',
    name: 'Cymbals & Metal',
    voices: [
      { name: 'Crash', kind: 'crash', decaySeconds: 3, recordedFile: 'crash_vl3_rr1.flac', recordedBank: 'cymbals' },
      { name: 'Splash', kind: 'crash', decaySeconds: 1.4, recordedFile: 'splash_vl3_rr1.flac', recordedBank: 'cymbals' },
      { name: 'China', kind: 'china', decaySeconds: 2.8, recordedFile: 'china_vl5_rr1.flac', recordedBank: 'cymbals' },
      { name: 'Ride', kind: 'ride', decaySeconds: 1.5, recordedFile: 'ride_vl3_rr2.flac', recordedBank: 'core' },
      { name: 'Ride Bell', kind: 'ride', decaySeconds: 1.8, recordedFile: 'ridebell_vl3_rr2.flac', recordedBank: 'core' },
      { name: 'Cowbell', kind: 'cowbell', decaySeconds: .35, freqHz: 560 },
      { name: 'Tambourine', kind: 'tambourine', decaySeconds: .55, filterHz: 4600 },
      { name: 'Claves', kind: 'claves', decaySeconds: .16, freqHz: 2100 },
    ],
  },
  {
    id: 'hand-percussion',
    name: 'Hand Percussion',
    voices: [
      { name: 'Low Conga', kind: 'conga', decaySeconds: .8, freqHz: 115 },
      { name: 'High Conga', kind: 'conga', decaySeconds: .55, freqHz: 190 },
      { name: 'Low Bongo', kind: 'bongo', decaySeconds: .5, freqHz: 170 },
      { name: 'High Bongo', kind: 'bongo', decaySeconds: .38, freqHz: 255 },
      { name: 'Claves', kind: 'claves', decaySeconds: .16, freqHz: 2100 },
      { name: 'Shaker', kind: 'shaker', decaySeconds: .22, filterHz: 5000 },
      { name: 'Tambourine', kind: 'tambourine', decaySeconds: .55, filterHz: 4200 },
      { name: 'Hand Clap', kind: 'clap', decaySeconds: .32, filterHz: 1400 },
    ],
  },
  {
    id: 'electronic-drums',
    name: 'Electronic Drums',
    voices: [
      { name: '808 Kick', kind: 'kick', decaySeconds: .8, freqHz: 48 },
      { name: 'Punch Kick', kind: 'kick', decaySeconds: .3, freqHz: 72 },
      { name: 'Electronic Snare', kind: 'snare', decaySeconds: .2, filterHz: 2200 },
      { name: 'Clap', kind: 'clap', decaySeconds: .26, filterHz: 1300 },
      { name: 'Closed Hat', kind: 'hihat', decaySeconds: .08, filterHz: 7600 },
      { name: 'Open Hat', kind: 'hihat', decaySeconds: .45, filterHz: 6500 },
      { name: 'Low Tom', kind: 'tom', decaySeconds: .5, freqHz: 92 },
      { name: 'High Tom', kind: 'tom', decaySeconds: .32, freqHz: 180 },
      { name: 'Cowbell', kind: 'cowbell', decaySeconds: .34, freqHz: 560 },
      { name: 'Crash', kind: 'crash', decaySeconds: 1.5, filterHz: 5200 },
    ],
  },
]

export const DRUM_KIT_VOICES = DRUM_KITS[0]!.voices

export function getDrumKitByName(name: string): DrumKitPreset | undefined {
  return DRUM_KITS.find((kit) => kit.name === name)
}
export function isDrumInstrumentName(name: string): boolean {
  return getDrumKitByName(name) !== undefined
}

function normalize(buffer: AudioBuffer, targetRms = .16, ceiling = .82): AudioBuffer {
  let energy = 0, peak = 0
  for (const data of Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel))) {
    for (const value of data) { energy += value * value; peak = Math.max(peak, Math.abs(value)) }
  }
  const rms = Math.sqrt(energy / Math.max(1, buffer.length * buffer.numberOfChannels))
  if (!rms || !peak) return buffer
  const gain = Math.min(targetRms / rms, ceiling / peak)
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < data.length; i++) data[i] = (data[i] ?? 0) * gain
  }
  return buffer
}

const recordedCache = new Map<string, Promise<AudioBuffer>>()
async function recordedVoice(voice: DrumVoice): Promise<AudioBuffer> {
  const url = `${voice.recordedBank === 'cymbals' ? CYMBALS : CORE}${voice.recordedFile}`
  let cached = recordedCache.get(url)
  if (!cached) {
    cached = (async () => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Could not load drum sample (${response.status})`)
      const decoder = new OfflineAudioContext(1, 1, 44100)
      return normalize(await decoder.decodeAudioData(await response.arrayBuffer()))
    })().catch((error: unknown) => { recordedCache.delete(url); throw error })
    recordedCache.set(url, cached)
  }
  return cached
}

function noise(ctx: OfflineAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.max(1, Math.ceil(seconds * ctx.sampleRate)), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

export async function renderDrumVoice(voice: DrumVoice): Promise<AudioBuffer> {
  const seconds = voice.decaySeconds + .08
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * 44100), 44100)
  const output = ctx.createGain(); output.connect(ctx.destination)
  const env = ctx.createGain(); env.gain.setValueAtTime(1, 0); env.gain.exponentialRampToValueAtTime(.001, voice.decaySeconds)
  if (voice.kind === 'kick' || voice.kind === 'tom' || voice.kind === 'conga' || voice.kind === 'bongo') {
    const osc = ctx.createOscillator(); const root = voice.freqHz ?? 110
    osc.type = voice.kind === 'kick' ? 'sine' : 'triangle'
    osc.frequency.setValueAtTime(root * (voice.kind === 'kick' ? 3.5 : 1.7), 0)
    osc.frequency.exponentialRampToValueAtTime(root, .05)
    osc.connect(env); env.connect(output); osc.start(); osc.stop(seconds)
  } else if (voice.kind === 'cowbell' || voice.kind === 'claves') {
    const root = voice.freqHz ?? 700
    for (const ratio of voice.kind === 'claves' ? [1] : [1, 1.48]) {
      const osc=ctx.createOscillator(); osc.type='square'; osc.frequency.value=root*ratio; osc.connect(env); osc.start(); osc.stop(seconds)
    }
    env.connect(output)
  } else {
    const source=ctx.createBufferSource(); source.buffer=noise(ctx, seconds)
    const filter=ctx.createBiquadFilter(); filter.type=voice.kind === 'clap' ? 'bandpass' : 'highpass'
    filter.frequency.value=voice.filterHz ?? (voice.kind === 'snare' ? 1800 : 5200)
    source.connect(filter); filter.connect(env); env.connect(output); source.start()
    if (voice.kind === 'snare') {
      const body=ctx.createOscillator(); const bodyEnv=ctx.createGain()
      body.type='triangle'; body.frequency.value=180; bodyEnv.gain.setValueAtTime(.5,0); bodyEnv.gain.exponentialRampToValueAtTime(.001,.13)
      body.connect(bodyEnv); bodyEnv.connect(output); body.start(); body.stop(seconds)
    }
    if (voice.kind === 'clap') {
      env.gain.setValueAtTime(0,0)
      for (const at of [0,.012,.024]) { env.gain.setValueAtTime(1,at); env.gain.exponentialRampToValueAtTime(.2,at+.01) }
      env.gain.setValueAtTime(.6,.024); env.gain.exponentialRampToValueAtTime(.001,voice.decaySeconds)
    }
  }
  return normalize(await ctx.startRendering())
}

export async function buildDrumKitKeys(kitId: DrumKitPreset['id'] = 'acoustic-drums'): Promise<AudioBuffer[]> {
  const kit = DRUM_KITS.find((item) => item.id === kitId) ?? DRUM_KITS[0]!
  return Promise.all(kit.voices.map(async (voice) => {
    if (voice.recordedFile) {
      try { return await recordedVoice(voice) }
      catch (error) { console.warn(`Recorded ${voice.name} unavailable; using fallback.`, error) }
    }
    return renderDrumVoice(voice)
  }))
}
