import type { EffectId, EffectSetting, Pad } from '../state/types'
import {
  buildGritCurve,
  dialToDetuneCents,
  dialToEchoParams,
  dialToFilterParams,
  dialToGain,
  dialToGritParams,
  dialToPlaybackRate,
} from './dialMapping'
import { trimToPlaybackWindow } from './trim'

function effectValue(effects: EffectSetting[], id: EffectId): number {
  return effects.find((effect) => effect.id === id)?.value ?? 0
}

/** A short param ramp time (seconds) so live dial changes don't click/zipper. */
const PARAM_RAMP_SECONDS = 0.015

interface PlayingNodes {
  source: AudioBufferSourceNode
  filter: BiquadFilterNode
  shaper: WaveShaperNode
  gain: GainNode
  delay: DelayNode
  feedback: GainNode
  wet: GainNode
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
  /** Every currently-playing source — looping and one-shot alike — so stopAllSounds() can reach all of them. */
  private readonly activeSources = new Set<AudioBufferSourceNode>()
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
    trim: { trimStart: number; trimEnd: number },
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

    // Grit: a WaveShaper whose curve is recomputed on every trigger/update. Kept
    // in the graph at all times (identity curve when clean) so the topology never
    // changes, the same reasoning as Filter's always-present allpass at 0.
    const shaper = ctx.createWaveShaper()
    shaper.curve = buildGritCurve(dialToGritParams(effectValue(effects, 'grit')))
    shaper.oversample = '2x'

    const gain = ctx.createGain()
    gain.gain.value = dialToGain(effectValue(effects, 'volume'))

    // Echo: delay + feedback loop, always wired up (feedback/wet at 0 when the
    // dial is neutral) so it too never needs graph surgery to turn on later.
    const delay = ctx.createDelay(1)
    const feedback = ctx.createGain()
    const wet = ctx.createGain()
    const echoParams = dialToEchoParams(effectValue(effects, 'echo'))
    delay.delayTime.value = echoParams.delaySeconds
    feedback.gain.value = echoParams.feedback
    wet.gain.value = echoParams.wetMix

    source.connect(filter)
    filter.connect(shaper)
    shaper.connect(gain)
    gain.connect(ctx.destination)
    gain.connect(delay)
    delay.connect(feedback)
    feedback.connect(delay)
    delay.connect(wet)
    wet.connect(ctx.destination)

    this.markStarted(padId)
    this.activeSources.add(source)
    source.onended = () => {
      this.markEnded(padId)
      this.activeSources.delete(source)
    }

    const startTime = options.startTime ?? ctx.currentTime
    const window = trimToPlaybackWindow(trim.trimStart, trim.trimEnd, buffer.duration)
    if (options.loop) {
      source.loopStart = window.loopStart
      source.loopEnd = window.loopEnd
      source.start(startTime, window.offset)
    } else {
      source.start(startTime, window.offset, window.duration)
    }
    return { source, filter, shaper, gain, delay, feedback, wet }
  }

  /**
   * Trigger a pad's sample from a manual tap/click — always a one-shot. Layers
   * freely: each call fires a new, independent, overlapping playback instance,
   * whether or not the pad is also currently looping via toggleLoop.
   */
  triggerPad(pad: Pad, buffer: AudioBuffer): void {
    this.playBuffer(
      pad.id,
      buffer,
      pad.effects,
      { trimStart: pad.trimStart, trimEnd: pad.trimEnd },
      { loop: false },
    )
  }

  /**
   * The loop button's action: start a continuous loop of this pad if it isn't
   * already looping, or stop it if it is. Deliberately separate from
   * triggerPad — tapping the pad body always plays it once; this is the only
   * way looping starts or stops, so the button's own visual state (driven by
   * isPadLooping) is always literally true.
   */
  toggleLoop(pad: Pad, buffer: AudioBuffer): void {
    if (this.isPadLooping(pad.id)) {
      this.stopPad(pad.id)
      return
    }

    const nodes = this.playBuffer(
      pad.id,
      buffer,
      pad.effects,
      { trimStart: pad.trimStart, trimEnd: pad.trimEnd },
      { loop: true },
    )
    this.loopingNodes.set(pad.id, nodes)
    this.notify()
    const { source } = nodes
    source.onended = () => {
      this.markEnded(pad.id)
      this.activeSources.delete(source)
      if (this.loopingNodes.get(pad.id)?.source === source) {
        this.loopingNodes.delete(pad.id)
        this.notify()
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
    const { source, filter, shaper, gain, delay, feedback, wet } = nodes
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
      case 'volume':
        gain.gain.setTargetAtTime(dialToGain(value), ctx.currentTime, PARAM_RAMP_SECONDS)
        break
      case 'grit':
        // WaveShaper's curve isn't an AudioParam, so this is a plain reassignment
        // rather than a click-free ramp — a small departure from the other dials'
        // smoothness, accepted since grit is inherently a "character" jump, not a
        // continuous sweep.
        shaper.curve = buildGritCurve(dialToGritParams(value))
        break
      case 'echo': {
        const params = dialToEchoParams(value)
        delay.delayTime.setTargetAtTime(params.delaySeconds, ctx.currentTime, PARAM_RAMP_SECONDS)
        feedback.gain.setTargetAtTime(params.feedback, ctx.currentTime, PARAM_RAMP_SECONDS)
        wet.gain.setTargetAtTime(params.wetMix, ctx.currentTime, PARAM_RAMP_SECONDS)
        break
      }
    }
  }

  /**
   * Fire a single sequencer step hit for a pad, scheduled at a precise audio-clock
   * time (from the lookahead Scheduler). Always a one-shot — a 16-step grid
   * re-firing an indefinite loop on every active step would be incoherent.
   * toggleLoop's continuous layer is a separate, manual performance action,
   * untouched by programmed steps. Layers freely like any other retrigger.
   */
  triggerStep(pad: Pad, buffer: AudioBuffer, time: number): void {
    this.playBuffer(
      pad.id,
      buffer,
      pad.effects,
      { trimStart: pad.trimStart, trimEnd: pad.trimEnd },
      { loop: false, startTime: time },
    )
  }

  /**
   * Live-update the trim window on a pad that's currently looping — `loopStart`/
   * `loopEnd` are plain settable properties on an already-playing source (unlike
   * `offset`/`duration`, which are only meaningful at `.start()` time), so this
   * takes effect on the source's next pass through the loop with no restart.
   */
  updateLoopingPadTrim(padId: string, trimStart: number, trimEnd: number): void {
    const nodes = this.loopingNodes.get(padId)
    const buffer = nodes?.source.buffer
    if (!nodes || !buffer) return
    const window = trimToPlaybackWindow(trimStart, trimEnd, buffer.duration)
    nodes.source.loopStart = window.loopStart
    nodes.source.loopEnd = window.loopEnd
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

  /**
   * The panic-stop button's action: silences everything currently audible —
   * every looping pad, every in-flight one-shot (a manual tap, a sequencer hit,
   * a long recording still playing out), all at once. Deliberately stops
   * `activeSources` directly rather than just `loopingNodes`, since a one-shot
   * source is never itself stoppable any other way once started.
   */
  stopAllSounds(): void {
    this.loopingNodes.clear()
    for (const source of Array.from(this.activeSources)) {
      try {
        source.stop()
      } catch {
        // Already stopped/ended between the snapshot above and this call — fine.
      }
    }
    this.notify()
  }
}
