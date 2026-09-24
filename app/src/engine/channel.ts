import type { EffectId, EffectSetting } from '../state/types'
import {
  buildGritCurve,
  buildReverbImpulse,
  dialToEchoParams,
  dialToFilterParams,
  dialToGain,
  dialToGritParams,
  dialToPan,
  dialToReverbParams,
  mixLevelToGain,
} from './dialMapping'

/** Fade length that keeps a cut from clicking — trimmed starts/ends and early stops. */
export const DECLICK_SECONDS = 0.004

/**
 * A note's envelope: full level at `start`, faded in when the note starts
 * mid-sample (a trimmed start, or a loop) and faded out when it's cut before
 * the sample's own end — the two places a hard edge would click. Shared by
 * live playback and the offline bounce, so both sound the same.
 */
export function shapeEnvelope(gain: AudioParam, start: number, level: number, options: { fadeIn: boolean; end: number | null }): void {
  if (options.fadeIn) {
    gain.setValueAtTime(0, start)
    gain.linearRampToValueAtTime(level, start + DECLICK_SECONDS)
  } else {
    gain.setValueAtTime(level, start)
  }
  if (options.end !== null) {
    gain.setValueAtTime(level, Math.max(start + DECLICK_SECONDS, options.end - DECLICK_SECONDS))
    gain.linearRampToValueAtTime(0, options.end)
  }
}

/** Headroom on the master bus: many layers summed stay well below full scale before the limiter. */
const MASTER_HEADROOM = 0.7

/**
 * A soft ceiling: linear up to 0.7, then curving smoothly toward 0.94. Web
 * Audio's compressor adds its own make-up gain and lets fast transients
 * through, so on its own it can't promise a ceiling; this can — nothing
 * that reaches it ever hard-clips, peaks are rounded instead.
 */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const size = 4096
  const curve = new Float32Array(new ArrayBuffer(size * Float32Array.BYTES_PER_ELEMENT))
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1
    const magnitude = Math.abs(x)
    const shaped = magnitude <= 0.7 ? magnitude : 0.7 + 0.24 * Math.tanh((magnitude - 0.7) / 0.24)
    curve[i] = Math.sign(x) * shaped
  }
  return curve
}

/**
 * The master stage between the mix and the output: headroom, a fast limiter
 * that holds the mix together, and a soft clipper as the final ceiling —
 * however many layers stack up, the output never distorts. Returns the node
 * to feed and the node to take the result from.
 */
export function createMasterStage(ctx: BaseAudioContext): { input: GainNode; output: WaveShaperNode } {
  const input = ctx.createGain()
  input.gain.value = MASTER_HEADROOM
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -9
  limiter.knee.value = 3
  limiter.ratio.value = 20
  limiter.attack.value = 0.001
  limiter.release.value = 0.12
  const ceiling = ctx.createWaveShaper()
  ceiling.curve = softClipCurve()
  // 2x is plenty for a curve this smooth (it only bends above 0.7); 4x cost
  // the audio thread twice as much for no audible difference.
  ceiling.oversample = '2x'
  input.connect(limiter)
  limiter.connect(ceiling)
  return { input, output: ceiling }
}

/** A short param ramp (seconds) so live dial changes don't click or zipper. */
export const PARAM_RAMP_SECONDS = 0.015

/** The dials a channel owns — pitch and speed belong to each voice's own source. */
const CHANNEL_EFFECTS: EffectId[] = ['filter', 'grit', 'volume', 'echo', 'reverb', 'pan']

/**
 * The shared reverb rooms every channel sends into. Building an impulse
 * response and running a convolver are the two most expensive things in the
 * audio graph, so there are only ever three — built lazily, the first time
 * a pad actually asks for reverb — instead of one per note.
 */
const ROOM_SECONDS = [0.6, 1.4, 3.2]

/** Light rooms: the right side hears the mono room this much later, which reads as width. */
const LIGHT_WIDTH_SECONDS = 0.013

export class ReverbRooms {
  private readonly ctx: BaseAudioContext
  private readonly destination: AudioNode
  private readonly light: boolean
  private readonly inputs: Array<GainNode | null> = ROOM_SECONDS.map(() => null)
  private readonly nodes: AudioNode[] = []

  /**
   * `light` (phones): each room convolves one mono channel instead of two —
   * half the audio-thread cost of the most expensive node in the app — and
   * gets its stereo width back from a short delay on the right side.
   */
  constructor(ctx: BaseAudioContext, destination: AudioNode, options: { light?: boolean } = {}) {
    this.ctx = ctx
    this.destination = destination
    this.light = options.light ?? false
  }

  /** The input of room `index`, building it on first use. */
  input(index: number): GainNode {
    let input = this.inputs[index]
    if (!input) {
      input = this.ctx.createGain()
      const convolver = this.ctx.createConvolver()
      if (this.light) {
        input.channelCount = 1
        input.channelCountMode = 'explicit'
        convolver.channelCount = 1
        convolver.channelCountMode = 'explicit'
        convolver.buffer = buildReverbImpulse(this.ctx, ROOM_SECONDS[index]!, 1)
        const right = this.ctx.createDelay(0.05)
        right.delayTime.value = LIGHT_WIDTH_SECONDS
        const merger = this.ctx.createChannelMerger(2)
        input.connect(convolver)
        convolver.connect(merger, 0, 0)
        convolver.connect(right)
        right.connect(merger, 0, 1)
        merger.connect(this.destination)
        this.nodes.push(input, convolver, right, merger)
      } else {
        convolver.buffer = buildReverbImpulse(this.ctx, ROOM_SECONDS[index]!)
        input.connect(convolver)
        convolver.connect(this.destination)
        this.nodes.push(input, convolver)
      }
      this.inputs[index] = input
    }
    return input
  }

  /**
   * How much of a decay time goes to each room: all of it to the nearest
   * room at either end, otherwise split between the two rooms around it, so
   * the dial still sweeps the room size smoothly.
   */
  static weights(decaySeconds: number): number[] {
    const weights = ROOM_SECONDS.map(() => 0)
    if (decaySeconds <= ROOM_SECONDS[0]!) weights[0] = 1
    else if (decaySeconds >= ROOM_SECONDS[ROOM_SECONDS.length - 1]!) weights[ROOM_SECONDS.length - 1] = 1
    else {
      const upper = ROOM_SECONDS.findIndex((seconds) => seconds >= decaySeconds)
      const low = ROOM_SECONDS[upper - 1]!
      const t = (decaySeconds - low) / (ROOM_SECONDS[upper]! - low)
      weights[upper - 1] = 1 - t
      weights[upper] = t
    }
    return weights
  }

  dispose(): void {
    for (const node of this.nodes) node.disconnect()
  }
}

/**
 * A pad's persistent channel strip: filter → grit → volume, an echo loop,
 * the Mixer fader, pan, and post-fader sends to the shared reverb rooms.
 * Built once per pad; every note of that pad is just a buffer source (plus a
 * tiny envelope) plugged into `input`. Dials set the channel's params, so a
 * change is heard on everything the pad is playing.
 */
export class Channel {
  readonly input: GainNode
  private readonly ctx: BaseAudioContext
  private readonly rooms: ReverbRooms
  private readonly filter: BiquadFilterNode
  private readonly shaper: WaveShaperNode
  private readonly volume: GainNode
  private readonly delay: DelayNode
  private readonly feedback: GainNode
  private readonly echoWet: GainNode
  private readonly mix: GainNode
  private readonly panner: StereoPannerNode
  private readonly sends: Array<GainNode | null> = [null, null, null]
  private readonly applied = new Map<EffectId, number>()
  private mixLevel: number | null = null
  /** The filter is only wired in while it does something — a neutral filter still cost the audio thread on every note. */
  private filterWired = false

  constructor(ctx: BaseAudioContext, destination: AudioNode, rooms: ReverbRooms, meter?: AudioNode) {
    this.ctx = ctx
    this.rooms = rooms
    this.input = ctx.createGain()
    this.filter = ctx.createBiquadFilter()
    this.shaper = ctx.createWaveShaper()
    this.volume = ctx.createGain()
    this.delay = ctx.createDelay(1)
    this.feedback = ctx.createGain()
    this.echoWet = ctx.createGain()
    this.mix = ctx.createGain()
    this.panner = ctx.createStereoPanner()

    this.input.connect(this.shaper)
    this.filter.connect(this.shaper)
    this.shaper.connect(this.volume)
    this.volume.connect(this.mix)
    this.volume.connect(this.delay)
    this.delay.connect(this.feedback)
    this.feedback.connect(this.delay)
    this.delay.connect(this.echoWet)
    this.echoWet.connect(this.mix)
    this.mix.connect(this.panner)
    this.panner.connect(destination)
    if (meter) this.panner.connect(meter)
  }

  /**
   * Brings the channel's dials in line with `effects` (an empty list reads as
   * all neutral — the effects bypass). Only dials that actually changed are
   * touched; `ramp` glides them so a live change doesn't click.
   */
  applyEffects(effects: EffectSetting[], ramp: boolean): void {
    for (const id of CHANNEL_EFFECTS) {
      const value = effects.find((effect) => effect.id === id)?.value ?? 0
      if (this.applied.get(id) === value) continue
      this.applied.set(id, value)
      this.setEffect(id, value, ramp)
    }
  }

  /** Live-updates one dial (from dragging it), gliding so it doesn't click. */
  setDial(id: EffectId, value: number): void {
    if (!CHANNEL_EFFECTS.includes(id) || this.applied.get(id) === value) return
    this.applied.set(id, value)
    this.setEffect(id, value, true)
  }

  setMixLevel(level: number, ramp: boolean): void {
    if (this.mixLevel === level) return
    this.mixLevel = level
    this.setParam(this.mix.gain, mixLevelToGain(level), ramp)
  }

  private setParam(param: AudioParam, value: number, ramp: boolean): void {
    if (ramp) param.setTargetAtTime(value, this.ctx.currentTime, PARAM_RAMP_SECONDS)
    else {
      param.cancelScheduledValues(0)
      param.value = value
    }
  }

  private setEffect(id: EffectId, value: number, ramp: boolean): void {
    switch (id) {
      case 'filter': {
        const params = dialToFilterParams(value)
        if (value !== 0 && !this.filterWired) {
          // Wire it in from a transparent start and glide to the target, so switching it on never clicks.
          this.filter.type = params.type
          this.filter.frequency.cancelScheduledValues(0)
          this.filter.frequency.value = params.type === 'highpass' ? 10 : 20000
          this.input.disconnect(this.shaper)
          this.input.connect(this.filter)
          this.filterWired = true
          this.setParam(this.filter.frequency, params.frequencyHz, ramp)
          break
        }
        this.filter.type = params.type
        this.setParam(this.filter.frequency, params.frequencyHz, ramp)
        // Switched off: it passes everything now; it's unwired once the pad falls silent (see compact).
        break
      }
      case 'grit': {
        // Clean grit is no shaper at all (a null curve passes audio through untouched).
        this.shaper.curve = value === 0 ? null : gritCurve(value)
        this.shaper.oversample = value === 0 ? 'none' : '2x'
        break
      }
      case 'volume':
        this.setParam(this.volume.gain, dialToGain(value), ramp)
        break
      case 'echo': {
        const params = dialToEchoParams(value)
        this.setParam(this.delay.delayTime, params.delaySeconds, ramp)
        this.setParam(this.feedback.gain, params.feedback, ramp)
        this.setParam(this.echoWet.gain, params.wetMix, ramp)
        break
      }
      case 'reverb': {
        const { decaySeconds, wetMix } = dialToReverbParams(value)
        ReverbRooms.weights(decaySeconds).forEach((weight, index) => {
          const level = wetMix * weight
          let send = this.sends[index]
          if (!send) {
            if (level === 0) return
            send = this.ctx.createGain()
            send.gain.value = 0
            this.mix.connect(send)
            send.connect(this.rooms.input(index))
            this.sends[index] = send
          }
          this.setParam(send.gain, level, ramp)
        })
        break
      }
      case 'pan':
        this.setParam(this.panner.pan, dialToPan(value), ramp)
        break
    }
  }

  /**
   * Called when the pad has no notes left: unwires a filter that's been
   * switched off. Rewiring while silent can't be heard; rewiring mid-note
   * could click, so a filter switched off mid-note stays wired until now.
   */
  compact(): void {
    if (this.filterWired && this.applied.get('filter') === 0) {
      this.input.disconnect(this.filter)
      this.input.connect(this.shaper)
      this.filterWired = false
    }
  }

  /** Fades the channel out (echo tail included) — for panic, before it's discarded. */
  fadeOut(seconds: number): void {
    const now = this.ctx.currentTime
    for (const param of [this.mix.gain, this.feedback.gain]) {
      param.cancelScheduledValues(now)
      param.setValueAtTime(param.value, now)
      param.linearRampToValueAtTime(0, now + seconds)
    }
  }

  dispose(): void {
    for (const node of [this.input, this.filter, this.shaper, this.volume, this.delay, this.feedback, this.echoWet, this.mix, this.panner]) {
      node.disconnect()
    }
    for (const send of this.sends) send?.disconnect()
  }
}

/** Grit curves are pure functions of the dial, so each is built once and shared. */
const gritCurves = new Map<number, Float32Array<ArrayBuffer>>()
function gritCurve(value: number): Float32Array<ArrayBuffer> {
  const key = Math.round(value)
  let curve = gritCurves.get(key)
  if (!curve) {
    curve = buildGritCurve(dialToGritParams(key))
    gritCurves.set(key, curve)
  }
  return curve
}
