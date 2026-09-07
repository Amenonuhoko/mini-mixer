import type { EffectId, EffectSetting, Pad } from '../state/types'
import { dialToDetuneCents, dialToFilterParams, dialToPlaybackRate } from './dialMapping'

function effectValue(effects: EffectSetting[], id: EffectId): number {
  return effects.find((effect) => effect.id === id)?.value ?? 0
}

/** A short param ramp time (seconds) so live dial changes don't click/zipper. */
const PARAM_RAMP_SECONDS = 0.015

interface PlayingNodes {
  source: AudioBufferSourceNode
  filter: BiquadFilterNode
}

/**
 * Owns the single AudioContext and all playback. Never touched directly by React —
 * components call these methods and the reducer/UI stay pure. Lazily created because
 * AudioContext must be started from a user gesture in most browsers.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  /** Pads currently looping, keyed by pad id — present only while actively playing. */
  private readonly loopingNodes = new Map<string, PlayingNodes>()
  /**
   * How many instances of each pad are currently audible (looping sustain counts as
   * one; each one-shot/sequencer hit counts for its own duration). Unifies "is this
   * pad making sound right now" across both playback styles for the UI.
   */
  private readonly activeInstanceCounts = new Map<string, number>()
  private readonly listeners = new Set<() => void>()

  /**
   * Subscribe to changes in engine-side playback state (which pads are looping,
   * which are audibly playing). Returns an unsubscribe function. Intended for
   * React's useSyncExternalStore, so the UI can reflect engine state without the
   * engine knowing anything about React.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  private markStarted(padId: string): void {
    this.activeInstanceCounts.set(padId, (this.activeInstanceCounts.get(padId) ?? 0) + 1)
    this.notify()
  }

  private markEnded(padId: string): void {
    const next = (this.activeInstanceCounts.get(padId) ?? 1) - 1
    if (next <= 0) {
      this.activeInstanceCounts.delete(padId)
    } else {
      this.activeInstanceCounts.set(padId, next)
    }
    this.notify()
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
    return this.loopingNodes.has(padId)
  }

  isPadPlaying(padId: string): boolean {
    return (this.activeInstanceCounts.get(padId) ?? 0) > 0
  }

  private playBuffer(
    padId: string,
    buffer: AudioBuffer,
    effects: EffectSetting[],
    options: { loop: boolean; startTime?: number },
  ): PlayingNodes {
    const ctx = this.getContext()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = options.loop
    source.playbackRate.value = dialToPlaybackRate(effectValue(effects, 'speed'))
    source.detune.value = dialToDetuneCents(effectValue(effects, 'pitch'))

    const filter = ctx.createBiquadFilter()
    const filterParams = dialToFilterParams(effectValue(effects, 'filter'))
    filter.type = filterParams.type
    filter.frequency.value = filterParams.frequencyHz

    source.connect(filter)
    filter.connect(ctx.destination)

    this.markStarted(padId)
    source.onended = () => this.markEnded(padId)

    source.start(options.startTime ?? ctx.currentTime)
    return { source, filter }
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

    const nodes = this.playBuffer(pad.id, buffer, pad.effects, { loop: pad.loop })

    if (pad.loop) {
      this.loopingNodes.set(pad.id, nodes)
      this.notify()
      const { source } = nodes
      source.onended = () => {
        this.markEnded(pad.id)
        if (this.loopingNodes.get(pad.id)?.source === source) {
          this.loopingNodes.delete(pad.id)
          this.notify()
        }
      }
    }
  }

  /**
   * Live-update one effect param on a pad that's currently looping, so dragging a
   * dial is audible immediately on the sustained sound rather than only affecting
   * the next trigger. No-op if the pad isn't currently looping — one-shot instances
   * already in flight aren't retroactively editable (there could be several
   * overlapping ones from layering, with no single "the" instance to update).
   */
  updateLoopingPadEffect(padId: string, effectId: EffectId, value: number): void {
    const nodes = this.loopingNodes.get(padId)
    if (!nodes) return
    const ctx = this.getContext()
    const { source, filter } = nodes
    switch (effectId) {
      case 'pitch':
        source.detune.setTargetAtTime(dialToDetuneCents(value), ctx.currentTime, PARAM_RAMP_SECONDS)
        break
      case 'speed':
        source.playbackRate.setTargetAtTime(
          dialToPlaybackRate(value),
          ctx.currentTime,
          PARAM_RAMP_SECONDS,
        )
        break
      case 'filter': {
        const params = dialToFilterParams(value)
        filter.type = params.type
        filter.frequency.setTargetAtTime(params.frequencyHz, ctx.currentTime, PARAM_RAMP_SECONDS)
        break
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
    this.playBuffer(pad.id, buffer, pad.effects, { loop: false, startTime: time })
  }

  /** A short synthetic click for the metronome — no sample/asset needed. */
  playMetronomeClick(time: number, accent: boolean): void {
    const ctx = this.getContext()
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = accent ? 1500 : 1000

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, time)
    gain.gain.linearRampToValueAtTime(accent ? 0.5 : 0.3, time + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(time)
    osc.stop(time + 0.06)
  }

  stopPad(padId: string): void {
    const nodes = this.loopingNodes.get(padId)
    if (!nodes) return
    this.loopingNodes.delete(padId)
    nodes.source.stop()
    this.notify()
  }

  stopAll(): void {
    for (const padId of Array.from(this.loopingNodes.keys())) {
      this.stopPad(padId)
    }
  }
}
