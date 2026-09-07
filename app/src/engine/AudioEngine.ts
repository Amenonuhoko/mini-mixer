import { DEFAULT_BPM, EFFECT_IDS, STEP_COUNT } from '../state/constants'
import type { EffectId, EffectSetting, Pad } from '../state/types'
import type { PerformanceHit } from './bounce'
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

/**
 * The effects list playBuffer should actually read for this pad — an empty
 * array when bypassed, since effectValue's lookup already falls back to 0
 * (neutral) for any id it can't find, giving a bypass for free with no
 * separate "neutral effects" construction needed. Preserves the pad's real
 * dial values untouched either way; this only changes what gets played.
 */
function effectiveEffects(pad: Pad): EffectSetting[] {
  return pad.effectsBypassed ? [] : pad.effects
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
  /** Kept in sync from the reducer's transport.bpm — see setBpm(). Used for loop-sync quantization. */
  private bpm = DEFAULT_BPM
  /**
   * The audio-clock time the current group of layered loops started at — reset
   * whenever the loop count drops to 0 and a new one starts, so it always
   * reflects "bar 0" of whatever's playing right now. Used to quantize a new
   * loop's start to the next bar boundary instead of cutting in instantly out
   * of phase with loops already playing. See toggleLoop().
   */
  private loopEpoch: number | null = null

  /** True while the record FAB is capturing a performance instead of the mic — see startPerformanceCapture. */
  private capturing = false
  /** Wall-clock (performance.now()) reference point for offsetting captured hits — not audio-clock time, since capture can start before any AudioContext resume completes. */
  private captureStartMs = 0
  private captureHits: PerformanceHit[] = []

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

  /** Kept in sync with the reducer's transport.bpm — see useBeatEngine. */
  setBpm(bpm: number): void {
    this.bpm = bpm
  }

  /** Seconds for one full bar (STEP_COUNT 16th-note steps = 4 beats in 4/4) at the current BPM. */
  private barSeconds(): number {
    const secondsPerStep = 60 / this.bpm / 4
    return secondsPerStep * STEP_COUNT
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
   * whether or not the pad is also currently looping via toggleLoop. Returns
   * the underlying source node so a caller can stop it early (see PadGrid's
   * gate-on-hold behavior) — calling .stop() on it is safe at any time and
   * self-cleans via the onended handler already wired up here.
   */
  triggerPad(pad: Pad, buffer: AudioBuffer): AudioBufferSourceNode {
    const { source } = this.playBuffer(
      pad.id,
      buffer,
      effectiveEffects(pad),
      { trimStart: pad.trimStart, trimEnd: pad.trimEnd },
      { loop: false },
    )
    return source
  }

  /**
   * The loop button's action: start a continuous loop of this pad if it isn't
   * already looping, or stop it if it is. Deliberately separate from
   * triggerPad — tapping the pad body always plays it once; this is the only
   * way looping starts or stops, so the button's own visual state (driven by
   * isPadLooping) is always literally true.
   *
   * If no other pad is currently looping, this loop starts immediately and
   * becomes the sync reference ("bar 0") for anything layered on top of it
   * later. If at least one pad is already looping, the new loop is quantized
   * to the next bar boundary instead of cutting in immediately, so layered
   * loops stay in phase with each other rather than starting at an arbitrary
   * offset. isPadLooping() (and so the UI's "looping" state) goes true as soon
   * as the loop is scheduled, even if its audible start is still up to a bar
   * away — matches how a "count-in" reads on a real sequencer.
   */
  toggleLoop(pad: Pad, buffer: AudioBuffer): void {
    if (this.isPadLooping(pad.id)) {
      this.stopPad(pad.id)
      return
    }

    const ctx = this.getContext()
    let startTime = ctx.currentTime
    if (this.loopingNodes.size === 0) {
      this.loopEpoch = startTime
    } else if (this.loopEpoch !== null) {
      const barSeconds = this.barSeconds()
      const barsElapsed = Math.ceil((startTime - this.loopEpoch) / barSeconds)
      startTime = this.loopEpoch + barsElapsed * barSeconds
    }

    const nodes = this.playBuffer(
      pad.id,
      buffer,
      effectiveEffects(pad),
      { trimStart: pad.trimStart, trimEnd: pad.trimEnd },
      { loop: true, startTime },
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
   * Live-applies (or lifts) the effects bypass on a pad that's currently
   * looping — reuses updateLoopingPadEffect once per dial rather than
   * duplicating the per-effect param logic, same "empty array reads as all
   * neutral" trick effectiveEffects() uses for a fresh trigger.
   */
  updateLoopingPadEffectsBypass(padId: string, pad: Pad): void {
    for (const effectId of EFFECT_IDS) {
      this.updateLoopingPadEffect(padId, effectId, effectValue(effectiveEffects(pad), effectId))
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
      effectiveEffects(pad),
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
  isCapturingPerformance(): boolean {
    return this.capturing
  }

  /**
   * Instrument mode's alternative to mic recording (see RecordFAB): while the
   * record FAB is held, pad presses are logged instead of audio being captured
   * from the microphone, then bounced offline into a single sample — see
   * engine/bounce.ts. Uses wall-clock time, not the audio context's clock, so
   * capture can start the instant the FAB is pressed without waiting on the
   * context to resume.
   */
  startPerformanceCapture(): void {
    this.capturing = true
    this.captureStartMs = performance.now()
    this.captureHits = []
  }

  stopPerformanceCapture(): PerformanceHit[] {
    this.capturing = false
    const hits = this.captureHits
    this.captureHits = []
    return hits
  }

  /** Seconds since capture started — call on press to timestamp a hit's offset. */
  performanceElapsedSeconds(): number {
    return (performance.now() - this.captureStartMs) / 1000
  }

  /**
   * Logs one pad press for the in-progress performance capture. No-op if
   * capture isn't active — callers can call this unconditionally on every
   * press without checking isCapturingPerformance() themselves first, though
   * they still need it to know whether to timestamp an offset in the first place.
   */
  logPerformanceHit(
    pad: Pad,
    buffer: AudioBuffer,
    offsetSeconds: number,
    durationSeconds: number | null,
  ): void {
    if (!this.capturing) return
    this.captureHits.push({
      padId: pad.id,
      buffer,
      effects: effectiveEffects(pad),
      trimStart: pad.trimStart,
      trimEnd: pad.trimEnd,
      offsetSeconds,
      durationSeconds,
    })
  }

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
