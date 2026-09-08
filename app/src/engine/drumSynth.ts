/**
 * A synthesized drum kit — the percussion counterpart to synth.ts's pitched
 * instrument presets. Deliberately a separate module rather than another
 * InstrumentPreset: a pitched preset is one patch pitch-shifted across 16
 * keys (renderSynthNote + semitone offsets), but a drum kit's 16 keys are 16
 * genuinely different voices (a kick doesn't sound like a snare pitched up)
 * — there's no single root/patch to shift, so the whole build shape here is
 * different: one distinct OfflineAudioContext render per named voice.
 */

export type DrumVoiceKind = 'kick' | 'snare' | 'hihat' | 'clap' | 'tom' | 'rim' | 'cowbell' | 'crash'

export interface DrumVoice {
  name: string
  kind: DrumVoiceKind
  /** Base pitch for tonal voices (kick/tom/cowbell) — ignored for noise-based kinds. */
  freqHz?: number
  /** How long the hit rings out before it's effectively silent. */
  decaySeconds: number
  /** Highpass cutoff for noise-based kinds (snare/hihat/clap/rim/crash) — higher is brighter/thinner. */
  filterHz?: number
}

/**
 * A single fixed 16-voice kit, ordered the way a hand would reach for them on
 * a pad grid rather than by pitch (there is no meaningful pitch order across
 * different drum sounds) — kick/snare/hats first as the most-used core,
 * toms/clap/rim/cowbell/cymbals filling out the rest, two "alt" variations of
 * the two most-used voices at the end for quick layering/variety.
 */
export const DRUM_KIT_VOICES: DrumVoice[] = [
  { name: 'Kick', kind: 'kick', freqHz: 55, decaySeconds: 0.35 },
  { name: 'Snare', kind: 'snare', decaySeconds: 0.18, filterHz: 1800 },
  { name: 'Closed Hat', kind: 'hihat', decaySeconds: 0.06, filterHz: 7000 },
  { name: 'Open Hat', kind: 'hihat', decaySeconds: 0.35, filterHz: 6000 },
  { name: 'Low Tom', kind: 'tom', freqHz: 90, decaySeconds: 0.4 },
  { name: 'Mid Tom', kind: 'tom', freqHz: 130, decaySeconds: 0.35 },
  { name: 'High Tom', kind: 'tom', freqHz: 180, decaySeconds: 0.3 },
  { name: 'Clap', kind: 'clap', decaySeconds: 0.25, filterHz: 1200 },
  { name: 'Rimshot', kind: 'rim', decaySeconds: 0.08, filterHz: 3500 },
  { name: 'Cowbell', kind: 'cowbell', freqHz: 560, decaySeconds: 0.3 },
  { name: 'Crash', kind: 'crash', decaySeconds: 1.8, filterHz: 5000 },
  { name: 'Ride', kind: 'crash', decaySeconds: 0.9, filterHz: 8000 },
  { name: 'Kick 2', kind: 'kick', freqHz: 70, decaySeconds: 0.22 },
  { name: 'Snare 2', kind: 'snare', decaySeconds: 0.12, filterHz: 2400 },
  { name: 'Shaker', kind: 'hihat', decaySeconds: 0.12, filterHz: 4000 },
  { name: 'Tambourine', kind: 'clap', decaySeconds: 0.15, filterHz: 4500 },
]

function createNoiseBuffer(ctx: OfflineAudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.ceil(seconds * ctx.sampleRate))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

/** Renders one drum voice into a standalone AudioBuffer — self-contained, no live AudioContext needed, same shape as synth.ts's renderSynthNote. */
export async function renderDrumVoice(voice: DrumVoice): Promise<AudioBuffer> {
  const sampleRate = 44100
  const totalSeconds = voice.decaySeconds + 0.05
  const ctx = new OfflineAudioContext(1, Math.ceil(totalSeconds * sampleRate), sampleRate)

  switch (voice.kind) {
    case 'kick':
    case 'tom': {
      // A sine with a fast downward pitch sweep is the classic cheap way to
      // fake a drum shell's thump with no sample — the sweep gives it an
      // attack transient a plain tone at one pitch wouldn't have.
      const root = voice.freqHz ?? 60
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(root * 4, 0)
      osc.frequency.exponentialRampToValueAtTime(root, 0.05)
      const envelope = ctx.createGain()
      envelope.gain.setValueAtTime(1, 0)
      envelope.gain.exponentialRampToValueAtTime(0.001, voice.decaySeconds)
      osc.connect(envelope)
      envelope.connect(ctx.destination)
      osc.start(0)
      osc.stop(totalSeconds)
      break
    }

    case 'cowbell': {
      // Two square oscillators at an inharmonic ratio through a bandpass —
      // the standard analog-drum-machine cowbell recipe.
      const root = voice.freqHz ?? 560
      const envelope = ctx.createGain()
      envelope.gain.setValueAtTime(1, 0)
      envelope.gain.exponentialRampToValueAtTime(0.001, voice.decaySeconds)
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = root
      filter.Q.value = 4
      filter.connect(envelope)
      envelope.connect(ctx.destination)
      for (const ratio of [1, 1.48]) {
        const osc = ctx.createOscillator()
        osc.type = 'square'
        osc.frequency.value = root * ratio
        osc.connect(filter)
        osc.start(0)
        osc.stop(totalSeconds)
      }
      break
    }

    // Snare/Hi-Hat/Clap/Rimshot/Crash are all fundamentally filtered noise —
    // the difference between them is just the filter cutoff and decay shape.
    case 'snare':
    case 'hihat':
    case 'rim':
    case 'crash': {
      const noise = ctx.createBufferSource()
      noise.buffer = createNoiseBuffer(ctx, totalSeconds)
      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = voice.filterHz ?? 2000
      const envelope = ctx.createGain()
      envelope.gain.setValueAtTime(1, 0)
      envelope.gain.exponentialRampToValueAtTime(0.001, voice.decaySeconds)
      noise.connect(filter)
      filter.connect(envelope)
      envelope.connect(ctx.destination)
      noise.start(0)

      if (voice.kind === 'snare') {
        // A short low tonal thump under the noise gives the snare body,
        // rather than sounding like pure hiss.
        const osc = ctx.createOscillator()
        osc.type = 'triangle'
        osc.frequency.value = 180
        const toneEnvelope = ctx.createGain()
        toneEnvelope.gain.setValueAtTime(0.6, 0)
        toneEnvelope.gain.exponentialRampToValueAtTime(0.001, voice.decaySeconds * 0.6)
        osc.connect(toneEnvelope)
        toneEnvelope.connect(ctx.destination)
        osc.start(0)
        osc.stop(totalSeconds)
      }
      break
    }

    case 'clap': {
      // Three quick noise bursts in place of one smooth decay is what makes
      // a clap read as a clap rather than a snare — a hand-clap is several
      // near-simultaneous slaps, not one continuous sound.
      const noise = ctx.createBufferSource()
      noise.buffer = createNoiseBuffer(ctx, totalSeconds)
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = voice.filterHz ?? 1200
      const envelope = ctx.createGain()
      envelope.gain.setValueAtTime(0, 0)
      for (const burstStart of [0, 0.012, 0.024]) {
        envelope.gain.setValueAtTime(1, burstStart)
        envelope.gain.exponentialRampToValueAtTime(0.2, burstStart + 0.01)
      }
      envelope.gain.setValueAtTime(0.6, 0.024)
      envelope.gain.exponentialRampToValueAtTime(0.001, voice.decaySeconds)
      noise.connect(filter)
      filter.connect(envelope)
      envelope.connect(ctx.destination)
      noise.start(0)
      break
    }
  }

  return ctx.startRendering()
}

/** Builds every kit voice in parallel — each render is independent, same as buildInstrumentKeysFromPreset. */
export async function buildDrumKitKeys(): Promise<AudioBuffer[]> {
  return Promise.all(DRUM_KIT_VOICES.map((voice) => renderDrumVoice(voice)))
}
