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
  private readonly listeners = new Set<() => void>()

  /**
   * Subscribe to changes in engine-side playback state (currently: which pads are
   * looping). Returns an unsubscribe function. Intended for React's
   * useSyncExternalStore, so the UI can reflect engine state without the engine
   * knowing anything about React.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

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
    // decodeAudioData detaches the buffer it's given, so hand it a copy — callers
    // (e.g. the sample library) may want to keep the original around.
    return this.getContext().decodeAudioData(data.slice(0))
  }

  isPadLooping(padId: string): boolean {
    return this.loopingSources.has(padId)
  }

  private playBuffer(
    buffer: AudioBuffer,
    effects: EffectSetting[],
    options: { loop: boolean; startTime?: number },
  ): AudioBufferSourceNode {
    const ctx = this.getContext()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = options.loop
    source.playbackRate.value = dialToPlaybackRate(effectValue(effects, 'speed'))
    source.detune.value = dialToDetuneCents(effectValue(effects, 'pitch'))

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = dialToFilterFrequencyHz(effectValue(effects, 'filter'))

    source.connect(filter)
    filter.connect(ctx.destination)
    source.start(options.startTime ?? ctx.currentTime)
    return source
  }

  /**
   * Trigger a pad's sample from a manual tap/click. Looping pads toggle: a second
   * call while already looping stops it. One-shot pads always layer freely — each
   * call fires a new, independent, overlapping playback instance.
   */
  triggerPad(pad: Pad, buffer: AudioBuffer): void {
    if (pad.loop && this.isPadLooping(pad.id)) {
      this.stopPad(pad.id)
      return
    }

    const source = this.playBuffer(buffer, pad.effects, { loop: pad.loop })

    if (pad.loop) {
      this.loopingSources.set(pad.id, source)
      this.notify()
      source.onended = () => {
        if (this.loopingSources.get(pad.id) === source) {
          this.loopingSources.delete(pad.id)
          this.notify()
        }
      }
    }
  }

  /**
   * Fire a single sequencer step hit for a pad, scheduled at a precise audio-clock
   * time (from the lookahead Scheduler). Always a one-shot, regardless of the pad's
   * manual loop-toggle setting — a 16-step grid re-firing an indefinite loop on every
   * active step would be incoherent. The loop toggle governs manual "hold a continuous
   * layer" performance use only, not programmed steps. Layers freely like any other
   * retrigger, so it's untouched by manual play/stop state on the same pad.
   */
  triggerStep(pad: Pad, buffer: AudioBuffer, time: number): void {
    this.playBuffer(buffer, pad.effects, { loop: false, startTime: time })
  }

  stopPad(padId: string): void {
    const source = this.loopingSources.get(padId)
    if (!source) return
    this.loopingSources.delete(padId)
    source.stop()
    this.notify()
  }

  stopAll(): void {
    for (const padId of Array.from(this.loopingSources.keys())) {
      this.stopPad(padId)
    }
  }
}
