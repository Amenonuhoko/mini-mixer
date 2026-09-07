import type { EffectSetting, Pad } from '../state/types'
import { dialToDetuneCents, dialToFilterFrequencyHz, dialToPlaybackRate } from './dialMapping'

function effectValue(effects: EffectSetting[], id: EffectSetting['id']): number {
  return effects.find((effect) => effect.id === id)?.value ?? 50
}

/**
 * Owns the single AudioContext and all playback. Never touched directly by React —
 * components call these methods and the reducer/UI stay pure. Lazily created because
 * AudioContext must be started from a user gesture in most browsers.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  /** Pads currently looping, keyed by pad id — present only while actively playing. */
  private readonly loopingSources = new Map<string, AudioBufferSourceNode>()

  getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
    return this.ctx
  }

  async decodeSample(data: ArrayBuffer): Promise<AudioBuffer> {
    return this.getContext().decodeAudioData(data)
  }

  isPadLooping(padId: string): boolean {
    return this.loopingSources.has(padId)
  }

  /**
   * Trigger a pad's sample. Looping pads toggle: a second call while already
   * looping stops it. One-shot pads always layer freely — each call fires a new,
   * independent, overlapping playback instance (standard sampler behavior), whether
   * triggered manually or by the sequencer landing on the same step.
   */
  triggerPad(pad: Pad, buffer: AudioBuffer): void {
    if (pad.loop && this.isPadLooping(pad.id)) {
      this.stopPad(pad.id)
      return
    }

    const ctx = this.getContext()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = pad.loop
    source.playbackRate.value = dialToPlaybackRate(effectValue(pad.effects, 'speed'))
    source.detune.value = dialToDetuneCents(effectValue(pad.effects, 'pitch'))

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = dialToFilterFrequencyHz(effectValue(pad.effects, 'filter'))

    source.connect(filter)
    filter.connect(ctx.destination)

    if (pad.loop) {
      this.loopingSources.set(pad.id, source)
      source.onended = () => {
        if (this.loopingSources.get(pad.id) === source) {
          this.loopingSources.delete(pad.id)
        }
      }
    }

    source.start()
  }

  stopPad(padId: string): void {
    const source = this.loopingSources.get(padId)
    if (!source) return
    this.loopingSources.delete(padId)
    source.stop()
  }

  stopAll(): void {
    for (const padId of Array.from(this.loopingSources.keys())) {
      this.stopPad(padId)
    }
  }
}
