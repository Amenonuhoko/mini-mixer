import { DEFAULT_BPM, STEP_COUNT } from '../state/constants'
import type { EffectId, EffectSetting, Pad } from '../state/types'
import { AUDIO_PROFILE } from './audioProfile'
import { preferPlaybackSession } from './audioSession'
import { Channel, createMasterStage, PARAM_RAMP_SECONDS, ReverbRooms, shapeEnvelope } from './channel'
import { dialToDetuneCents, dialToPlaybackRate } from './dialMapping'
import { Performer } from './performer'
import { seamlessLoopBuffer } from './loopSeam'
import { trimToPlaybackWindow } from './trim'

function effectValue(effects: EffectSetting[], id: EffectId): number {
  return effects.find((effect) => effect.id === id)?.value ?? 0
}

/**
 * The effects list a pad's notes should actually use — an empty
 * array when bypassed, since effectValue's lookup already falls back to 0
 * (neutral) for any id it can't find, giving a bypass for free with no
 * separate "neutral effects" construction needed. Preserves the pad's real
 * dial values untouched either way; this only changes what gets played.
 */
function effectiveEffects(pad: Pad): EffectSetting[] {
  return pad.effectsBypassed ? [] : pad.effects
}

/** How long a stolen or released note takes to fade out. */
const RELEASE_SECONDS = 0.015
/** A loop handing over to its re-trimmed self fades out this fast, matching the new cycle's fade-in. */
const DECLICK_HANDOVER_SECONDS = 0.004
/** Most notes one pad may ring at once; the oldest fades out to make room. */
const MAX_VOICES_PER_PAD = 4
/** Most notes the whole app may ring at once (fewer on a phone — see AudioProfile). */
const MAX_VOICES = AUDIO_PROFILE.maxVoices

/** Samples per meter read — ~5ms at 48kHz, short enough to track a drum transient frame to frame. */
const METER_FFT_SIZE = 256

/** Called when a pad instance is scheduled to sound; `when` is on the AudioContext clock (may be slightly in the future for sequencer steps). */
export type PadHitListener = (padId: string, when: number) => void

export interface BeatPhase {
  /** 0 at the downbeat of the current beat, rising toward 1 just before the next. */
  phase: number
  /** True when locked to something actually playing (sequencer/metronome clock or layered loops), false when free-running at the BPM. */
  locked: boolean
}

/** Wraps into [0, 1), including negative inputs (an anchor slightly in the future). */
function fract(value: number): number {
  return value - Math.floor(value)
}

/** A playing note that can be stopped early — cleanly, with a short fade rather than a click. */
export interface Voice {
  stop(): void
}

interface LiveVoice extends Voice {
  padId: string
  source: AudioBufferSourceNode
  loop: boolean
  readonly released: boolean
  /** What it was started from — a loop plays a seamless copy (see loopSeam), so a trim change rebuilds from these. */
  pad: Pad
  original: AudioBuffer
  /** When it starts sounding, on the audio clock. */
  startedAt: number
  /** Fades the note out, from `at` (default: now). */
  release(fadeSeconds?: number, at?: number): void
}

/**
 * Owns the single AudioContext and all playback. Never touched directly by React —
 * components call these methods and the reducer/UI stay pure. Lazily created because
 * AudioContext must be started from a user gesture in most browsers.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  /** Pads currently looping, keyed by pad id — present only while actively playing. */
  private readonly loopingVoices = new Map<string, LiveVoice>()
  /** Every sounding (or scheduled) note, oldest first — for voice limits and panic. */
  private voices: LiveVoice[] = []
  /** Each pad's persistent channel strip (see engine/channel.ts), built on its first note. */
  private readonly channels = new Map<string, Channel>()
  private rooms: ReverbRooms | null = null
  /** Headroom, limiter and soft ceiling between the mix and the output (see createMasterStage). */
  private masterStage: { input: GainNode; output: WaveShaperNode } | null = null
  /**
   * How many instances of each pad are currently audible (looping sustain counts as
   * one; each one-shot/sequencer hit counts for its own duration). Unifies "is this
   * pad making sound right now" across both playback styles for the UI.
   */
  private readonly activeInstanceCounts = new Map<string, number>()
  /** Preview sources (library audition, recording review) — so stopAllSounds() can reach them too. */
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
  /** Immediate transport gate: prevents an already queued scheduler callback from firing after Stop. */
  private sequencerPlaybackEnabled = false

  /** Every playback node routes through this instead of ctx.destination directly, so a playthrough recording (see startPlaythroughRecording) can tap the same signal everything else hears. */
  private masterBus: GainNode | null = null
  /** Final output gain, after the project mix but before the device speakers. */
  private masterOutput: GainNode | null = null
  private recordTap: MediaStreamAudioDestinationNode | null = null
  private playthroughRecorder: MediaRecorder | null = null
  private playthroughChunks: Blob[] = []
  /** The Library can audition one sound at a time without assigning it to a pad. */
  private libraryPreview: AudioBufferSourceNode | null = null

  // Light-show taps. Pure observers: each analyser hangs off the signal via a
  // parallel connection into a zero-gain sink, so nothing about what's heard
  // (or what a playthrough recording captures) changes. The sink exists only
  // so the analysers are pulled by the graph even though they're otherwise
  // dead ends.
  private readonly padMeters = new Map<string, AnalyserNode>()
  /** Each pad's own level and its bank's volume (0–1); a channel plays their product. */
  private readonly padMixLevels = new Map<string, number>()
  private readonly bankScales = new Map<string, number>()
  private masterMeter: AnalyserNode | null = null
  private meterSink: GainNode | null = null
  private readonly meterScratch = new Float32Array(METER_FFT_SIZE)
  private readonly hitListeners = new Set<PadHitListener>()
  /** Audio-clock time of the most recent beat the scheduler reported — see markBeat(). */
  private lastBeatTime: number | null = null
  private performer: Performer | null = null
  private lastStep: { index: number; time: number; count: number } | null = null

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

  private notifyPending = false

  private notify(): void {
    if (this.notifyPending) return
    this.notifyPending = true
    queueMicrotask(() => {
      this.notifyPending = false
      for (const listener of this.listeners) listener()
    })
  }

  private markStarted(padId: string): void {
    this.activeInstanceCounts.set(padId, (this.activeInstanceCounts.get(padId) ?? 0) + 1)
    this.notify()
  }

  private markEnded(padId: string): void {
    const next = (this.activeInstanceCounts.get(padId) ?? 1) - 1
    if (next <= 0) {
      this.activeInstanceCounts.delete(padId)
      // Silent now: the channel can drop any processing it no longer needs.
      this.channels.get(padId)?.compact()
    } else {
      this.activeInstanceCounts.set(padId, next)
    }
    this.notify()
  }

  /** Enables or immediately blocks sequencer-triggered playback outside React's render timing. */
  setSequencerPlaybackEnabled(enabled: boolean): void {
    this.sequencerPlaybackEnabled = enabled
  }

  isSequencerPlaybackEnabled(): boolean {
    return this.sequencerPlaybackEnabled
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
      // The output buffer is sized for the device (see AudioProfile): on a
      // phone, a bigger one is what keeps the audio thread from underrunning.
      this.ctx = new AudioContext({ latencyHint: AUDIO_PROFILE.latencyHint })
      preferPlaybackSession()
      // A phone suspends (or iOS "interrupts") audio when the app is
      // backgrounded or a call comes in; wake it when the app is back.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.wake()
      })
    }
    this.wake()
    return this.ctx
  }

  /** Resumes a suspended or interrupted context — every note and gesture passes through here. */
  private wake(): void {
    const ctx = this.ctx
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return
    void ctx.resume().catch(() => {
      // Not allowed without a gesture yet — the next tap resumes it.
    })
  }

  /** Lazily-created hub every playback node connects to instead of ctx.destination directly. */
  private getMasterBus(): GainNode {
    const ctx = this.getContext()
    if (!this.masterBus) {
      this.masterBus = ctx.createGain()
      this.masterStage = createMasterStage(ctx)
      this.masterOutput = ctx.createGain()
      this.masterBus.connect(this.masterStage.input)
      this.masterStage.output.connect(this.masterOutput)
      this.masterOutput.connect(ctx.destination)
      this.masterMeter = this.createMeter(ctx)
      this.masterBus.connect(this.masterMeter)
    }
    return this.masterBus
  }

  private createMeter(ctx: AudioContext): AnalyserNode {
    if (!this.meterSink) {
      this.meterSink = ctx.createGain()
      this.meterSink.gain.value = 0
      this.meterSink.connect(ctx.destination)
    }
    const meter = ctx.createAnalyser()
    meter.fftSize = METER_FFT_SIZE
    meter.connect(this.meterSink)
    return meter
  }

  private getPadMeter(padId: string): AnalyserNode {
    let meter = this.padMeters.get(padId)
    if (!meter) {
      meter = this.createMeter(this.getContext())
      this.padMeters.set(padId, meter)
    }
    return meter
  }

  /** Peak amplitude over the analyser's current window, shaped to a 0-1 brightness. */
  private readMeter(meter: AnalyserNode | null | undefined): number {
    if (!meter) return 0
    meter.getFloatTimeDomainData(this.meterScratch)
    let peak = 0
    for (const sample of this.meterScratch) {
      const magnitude = Math.abs(sample)
      if (magnitude > peak) peak = magnitude
    }
    // A square-root curve lifts quiet material so it still visibly glows,
    // while loud hits still saturate at full brightness.
    return Math.min(1, Math.sqrt(peak) * 1.15)
  }

  /** How loud this pad is right now (0-1), echo/reverb tails included. Never creates an AudioContext. */
  getPadLevel(padId: string): number {
    if (!this.ctx) return 0
    return this.readMeter(this.padMeters.get(padId))
  }

  /** How loud the whole project mix is right now (0-1). Never creates an AudioContext. */
  getMasterLevel(): number {
    if (!this.ctx) return 0
    return this.readMeter(this.masterMeter)
  }

  /** Subscribe to every pad hit (manual, loop start, or sequencer step). Returns an unsubscribe function. */
  onPadHit(listener: PadHitListener): () => void {
    this.hitListeners.add(listener)
    return () => this.hitListeners.delete(listener)
  }

  /** Current time on the audio clock, or null before audio has ever started (so the UI never creates a context on its own). */
  getAudioTime(): number | null {
    return this.ctx ? this.ctx.currentTime : null
  }

  /** Called by the lookahead scheduler for every sequencer step it schedules, with that step's audio time. */
  markStep(index: number, time: number, count: number): void {
    this.lastStep = { index, time, count }
  }

  /**
   * The sequencer step playing at a given audio time (nearest 16th), from the
   * last step the scheduler reported — how a performed note that was
   * scheduled ahead of time is recorded onto the step it's actually heard on.
   */
  stepAt(time: number): number | null {
    const last = this.lastStep
    if (!last) return null
    const offset = Math.round((time - last.time) / (60 / this.bpm / 4))
    return (((last.index + offset) % last.count) + last.count) % last.count
  }

  /**
   * The sequencer step being heard right now, or null when the sequencer
   * isn't playing — what the playhead shows. Steps are reported when they're
   * scheduled (up to ~100 ms ahead), so this counts back from the last one.
   */
  getPlayheadStep(): number | null {
    const last = this.lastStep
    if (!last || !this.ctx || !this.sequencerPlaybackEnabled) return null
    const offset = Math.floor((this.ctx.currentTime - last.time) / (60 / this.bpm / 4) + 1e-6)
    return (((last.index + offset) % last.count) + last.count) % last.count
  }

  /** Called by the lookahead scheduler on every quarter-note step, with that beat's scheduled audio time. */
  markBeat(time: number): void {
    this.lastBeatTime = time
  }

  /**
   * Where we are within the current beat. Locks to the scheduler's clock while
   * it's running (sequencer or metronome), otherwise to the layered-loop
   * epoch if any loops are going; with nothing playing it free-runs at the
   * BPM so the idle screen still breathes in tempo.
   */
  getBeatPhase(): BeatPhase {
    const beatSeconds = 60 / this.bpm
    const now = this.ctx?.currentTime
    if (now !== undefined) {
      if (this.lastBeatTime !== null && Math.abs(now - this.lastBeatTime) < beatSeconds * 2) {
        return { phase: fract((now - this.lastBeatTime) / beatSeconds), locked: true }
      }
      if (this.loopingVoices.size > 0 && this.loopEpoch !== null) {
        return { phase: fract((now - this.loopEpoch) / beatSeconds), locked: true }
      }
    }
    return { phase: fract(performance.now() / 1000 / beatSeconds), locked: false }
  }

  /** Note repeat / arpeggiator / strum for held pads, playing through this engine (see engine/performer.ts). */
  getPerformer(): Performer {
    this.performer ??= new Performer({
      now: () => this.getContext().currentTime,
      beatAnchor: () => this.getBeatAnchor(),
      play: (pad, note, time, level) => this.triggerNote(pad, note.buffer, time, note.cents, level),
    })
    return this.performer
  }

  /** Audio time of the most recent beat when the beat is locked to something playing, else null — the grid note repeat snaps to. */
  getBeatAnchor(): number | null {
    const now = this.ctx?.currentTime
    const { phase, locked } = this.getBeatPhase()
    return locked && now !== undefined ? now - phase * (60 / this.bpm) : null
  }

  /** Changes the final listening level without disturbing individual pad faders. */
  setMasterVolume(level: number): void {
    const ctx = this.getContext()
    this.getMasterBus()
    this.masterOutput!.gain.setTargetAtTime(Math.max(0, Math.min(100, level)) / 100, ctx.currentTime, PARAM_RAMP_SECONDS)
  }

  private getMasterOutput(): GainNode {
    this.getMasterBus()
    return this.masterOutput!
  }

  async decodeSample(data: ArrayBuffer): Promise<AudioBuffer> {
    // decodeAudioData detaches the buffer it's given, so hand it a copy — callers
    // (e.g. the sample library) may want to keep the original around.
    return this.getContext().decodeAudioData(data.slice(0))
  }

  isPadLooping(padId: string): boolean {
    return this.loopingVoices.has(padId)
  }

  isPadPlaying(padId: string): boolean {
    return (this.activeInstanceCounts.get(padId) ?? 0) > 0
  }

  /** Play a Library item through the master output without creating a pad. */
  previewSample(buffer: AudioBuffer, onEnded?: () => void): void {
    this.stopLibraryPreview()
    const ctx = this.getContext()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(this.getMasterBus())
    this.libraryPreview = source
    this.activeSources.add(source)
    source.onended = () => {
      this.activeSources.delete(source)
      if (this.libraryPreview === source) this.libraryPreview = null
      onEnded?.()
    }
    source.start()
  }

  /** Stop the current Library audition, if there is one. */
  stopLibraryPreview(): void {
    const source = this.libraryPreview
    if (!source) return
    this.libraryPreview = null
    try {
      source.stop()
    } catch {
      // A preview can naturally end just before Stop is tapped.
    }
  }

  private channelFor(padId: string): Channel {
    let channel = this.channels.get(padId)
    if (!channel) {
      const ctx = this.getContext()
      const master = this.getMasterBus()
      this.rooms ??= new ReverbRooms(ctx, master, { light: AUDIO_PROFILE.lightReverb })
      channel = new Channel(ctx, master, this.rooms, this.getPadMeter(padId))
      this.channels.set(padId, channel)
    }
    return channel
  }

  /**
   * Starts one note of a pad: a buffer source and a tiny envelope into the
   * pad's channel strip — nothing else is built per note, which is what keeps
   * dense beats, arpeggios and note repeat glitch-free. The envelope fades in
   * a trimmed start and fades out a trimmed end so cuts never click, and the
   * pad's (and the app's) voice limits fade the oldest note out rather than
   * letting notes pile up.
   */
  private startVoice(pad: Pad, buffer: AudioBuffer, options: { time?: number; loop?: boolean; cents?: number; level?: number } = {}): LiveVoice {
    const ctx = this.getContext()
    const channel = this.channelFor(pad.id)
    const effects = effectiveEffects(pad)
    // A silent pad takes its settings at once; one that's sounding glides to them so nothing clicks.
    const sounding = this.activeInstanceCounts.has(pad.id)
    channel.applyEffects(effects, sounding)
    this.padMixLevels.set(pad.id, pad.mixLevel)
    channel.setMixLevel(pad.mixLevel * (this.bankScales.get(pad.id) ?? 1), sounding)

    // A note scheduled for a moment that has already passed plays now.
    const start = Math.max(options.time ?? ctx.currentTime, ctx.currentTime)
    const loop = options.loop ?? false
    const level = options.level ?? 1

    this.makeRoom(pad.id, start)

    const window = trimToPlaybackWindow(pad.trimStart, pad.trimEnd, buffer.duration)
    const source = ctx.createBufferSource()
    // A loop plays one seamless cycle over and over (see loopSeam), so its seam never clicks.
    source.buffer = loop ? seamlessLoopBuffer(ctx, buffer, window.loopStart, window.loopEnd) : buffer
    source.loop = loop
    const rate = dialToPlaybackRate(effectValue(effects, 'speed'))
    const detune = dialToDetuneCents(effectValue(effects, 'pitch')) + (options.cents ?? 0)
    source.playbackRate.value = rate
    source.detune.value = detune

    const env = ctx.createGain()
    env.gain.value = 0
    source.connect(env)
    env.connect(channel.input)

    // Every one-shot fades out over its last few milliseconds — a recording that
    // stops mid-waveform would otherwise click at its natural end, not just a trimmed one.
    shapeEnvelope(env.gain, start, level, {
      fadeIn: window.offset > 0.001 || loop,
      end: loop ? null : start + window.duration / (rate * Math.pow(2, detune / 1200)),
    })

    /** When the note's fade-out begins — a later, earlier-reaching release (a Stop) still wins. */
    let releasedAt: number | null = null
    const voice: LiveVoice = {
      padId: pad.id,
      source,
      loop,
      get released() { return releasedAt !== null },
      pad,
      original: buffer,
      startedAt: start,
      release: (fadeSeconds = RELEASE_SECONDS, at = ctx.currentTime) => {
        const from = Math.max(at, ctx.currentTime)
        if (releasedAt !== null && from >= releasedAt) return
        releasedAt = from
        // Glide down from whatever level the note has reached — works before, during or after its attack.
        if (typeof env.gain.cancelAndHoldAtTime === 'function') env.gain.cancelAndHoldAtTime(from)
        else {
          env.gain.cancelScheduledValues(from)
          env.gain.setValueAtTime(env.gain.value, from)
        }
        env.gain.setTargetAtTime(0, from, fadeSeconds / 4)
        try {
          source.stop(from + fadeSeconds * 1.5)
        } catch {
          // Already stopped.
        }
      },
      stop: () => voice.release(),
    }

    this.voices.push(voice)
    this.markStarted(pad.id)
    source.onended = () => {
      source.disconnect()
      env.disconnect()
      this.voices = this.voices.filter((item) => item !== voice)
      if (this.loopingVoices.get(pad.id) === voice) {
        this.loopingVoices.delete(pad.id)
      }
      this.markEnded(pad.id)
    }

    if (loop) {
      source.start(start)
    } else {
      source.start(start, window.offset, window.duration)
    }
    for (const listener of this.hitListeners) listener(pad.id, start)
    return voice
  }

  /** Voice limits: fades out the oldest one-shot note of this pad (and of the whole app) when they're full. */
  private makeRoom(padId: string, at: number): void {
    const oneShots = this.voices.filter((voice) => !voice.loop && !voice.released)
    const ofPad = oneShots.filter((voice) => voice.padId === padId)
    if (ofPad.length >= MAX_VOICES_PER_PAD) ofPad[0]!.release(RELEASE_SECONDS, at)
    const live = this.voices.filter((voice) => !voice.released)
    if (live.length >= MAX_VOICES) (oneShots[0] ?? live[0])!.release(RELEASE_SECONDS, at)
  }

  /**
   * Trigger a pad's sample from a manual tap/click — always a one-shot. Layers
   * freely with its other notes (up to the voice limit), whether or not the
   * pad is also looping. Returns the note so a gated press can stop it on
   * release — with a short fade, never a click.
   */
  triggerPad(pad: Pad, buffer: AudioBuffer): Voice {
    return this.startVoice(pad, buffer)
  }

  /**
   * The loop button's action: start a continuous loop of this pad if it isn't
   * already looping, or stop it if it is. If no other pad is looping, this loop
   * starts immediately and becomes the sync reference ("bar 0") for anything
   * layered on top; otherwise it's quantized to the next bar boundary so
   * layered loops stay in phase. isPadLooping() goes true as soon as the loop
   * is scheduled, even if its audible start is still up to a bar away.
   */
  toggleLoop(pad: Pad, buffer: AudioBuffer): void {
    if (this.isPadLooping(pad.id)) {
      this.stopPad(pad.id)
      return
    }

    const ctx = this.getContext()
    let startTime = ctx.currentTime
    if (this.loopingVoices.size === 0) {
      this.loopEpoch = startTime
    } else if (this.loopEpoch !== null) {
      const barSeconds = this.barSeconds()
      const barsElapsed = Math.ceil((startTime - this.loopEpoch) / barSeconds)
      startTime = this.loopEpoch + barsElapsed * barSeconds
    }

    this.loopingVoices.set(pad.id, this.startVoice(pad, buffer, { time: startTime, loop: true }))
    this.notify()
  }

  /**
   * Live-updates one dial of a pad, so dragging it is heard immediately.
   * Pitch and speed belong to each note, so they reach the pad's loop (the
   * one sustained note there is); every other dial is the pad's channel,
   * heard on everything the pad is playing.
   */
  updateLoopingPadEffect(padId: string, effectId: EffectId, value: number): void {
    const ctx = this.ctx
    if (!ctx) return
    if (effectId === 'pitch' || effectId === 'speed') {
      const loop = this.loopingVoices.get(padId)
      if (!loop) return
      const param = effectId === 'pitch' ? loop.source.detune : loop.source.playbackRate
      const target = effectId === 'pitch' ? dialToDetuneCents(value) : dialToPlaybackRate(value)
      param.setTargetAtTime(target, ctx.currentTime, PARAM_RAMP_SECONDS)
      return
    }
    this.channels.get(padId)?.setDial(effectId, value)
  }

  /** Live-applies (or lifts) the effects bypass on a pad — its channel and its loop. */
  updateLoopingPadEffectsBypass(padId: string, pad: Pad): void {
    const effects = effectiveEffects(pad)
    this.channels.get(padId)?.applyEffects(effects, true)
    for (const effectId of ['pitch', 'speed'] as const) this.updateLoopingPadEffect(padId, effectId, effectValue(effects, effectId))
  }

  /**
   * Fire a single sequencer step hit for a pad at a precise audio-clock time
   * (from the lookahead Scheduler). Always a one-shot.
   */
  triggerStep(pad: Pad, buffer: AudioBuffer, time: number, level = 1): void {
    if (level > 0) this.startVoice(pad, buffer, { time, level })
  }

  /**
   * A single performed note (note repeat, arpeggio, strum) through the pad's
   * channel at an exact audio time — optionally nudged by `cents` when the
   * exact pitch isn't in the bank's note pool, and scaled by `level` (a
   * strum's notes share one chord's loudness).
   */
  triggerNote(pad: Pad, buffer: AudioBuffer, time: number, cents = 0, level = 1): Voice {
    return this.startVoice(pad, buffer, { time, cents, level })
  }

  /**
   * A bank's volume (0–100) over all its pads — kept apart from each pad's
   * own level, and live on anything those pads are playing.
   */
  setBankVolume(padIds: string[], level: number): void {
    const scale = Math.max(0, Math.min(100, level)) / 100
    for (const padId of padIds) {
      if (this.bankScales.get(padId) === scale) continue
      this.bankScales.set(padId, scale)
      const padLevel = this.padMixLevels.get(padId)
      if (padLevel !== undefined) this.channels.get(padId)?.setMixLevel(padLevel * scale, true)
    }
  }

  /** Live-updates a pad's Mixer Mode fader — heard on everything the pad is playing. */
  updateLoopingPadMixLevel(padId: string, level: number): void {
    this.padMixLevels.set(padId, level)
    this.channels.get(padId)?.setMixLevel(level * (this.bankScales.get(padId) ?? 1), true)
  }

  /**
   * Live-update the trim window on a pad that's currently looping. A loop
   * plays one seamless cycle of its window (see loopSeam), so the new window
   * is a new cycle: it takes over at the current cycle's next boundary —
   * the old one fading out as the new one fades in over a few milliseconds —
   * so the change lands on the loop's next pass with no restart and no
   * click. Dragging a trim handle calls this repeatedly; a takeover that
   * hasn't started yet is simply replaced.
   */
  updateLoopingPadTrim(padId: string, trimStart: number, trimEnd: number): void {
    const loop = this.loopingVoices.get(padId)
    const cycle = loop?.source.buffer
    if (!loop || !cycle) return
    const ctx = this.getContext()
    const now = ctx.currentTime
    let at: number
    if (loop.startedAt > now) {
      // A takeover still waiting for its boundary: replace it at the same moment.
      at = loop.startedAt
      loop.source.onended = null
      try {
        loop.source.stop()
      } catch {
        // Never started — fine.
      }
      this.voices = this.voices.filter((item) => item !== loop)
      this.markEnded(padId)
    } else {
      const speed = loop.source.playbackRate.value * Math.pow(2, loop.source.detune.value / 1200)
      const period = cycle.duration / speed
      // At least a few ms ahead, so the takeover is always scheduled in the future.
      at = loop.startedAt + Math.max(1, Math.ceil((now + 0.02 - loop.startedAt) / period)) * period
      loop.release(DECLICK_HANDOVER_SECONDS, at)
    }
    const pad = { ...loop.pad, trimStart, trimEnd }
    this.loopingVoices.set(padId, this.startVoice(pad, loop.original, { time: at, loop: true }))
  }

  /**
   * A bare, effects-free looping preview of a not-yet-committed recording —
   * used by RecordingReview so you can hear what you just recorded, looped,
   * while deciding whether to keep it. Connects straight to ctx.destination
   * (like the metronome) rather than the master bus: a preview is monitoring,
   * not part of the project, so it shouldn't bleed into a playthrough
   * recording running at the same time. Tracked in activeSources so the
   * panic "stop all sounds" button can also silence it.
   */
  previewLoop(buffer: AudioBuffer): AudioBufferSourceNode {
    const ctx = this.getContext()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(this.getMasterOutput())
    this.activeSources.add(source)
    source.onended = () => this.activeSources.delete(source)
    source.start()
    return source
  }

  /**
   * A short synthetic click for the metronome — no sample/asset needed.
   * Deliberately connects straight to ctx.destination, not the master bus: a
   * click track is a monitoring aid for the performer, not part of the beat
   * itself, so a playthrough recording (which taps the master bus) should
   * never pick it up.
   */
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
    gain.connect(this.getMasterOutput())
    osc.start(time)
    osc.stop(time + 0.06)
  }

  stopPad(padId: string): void {
    const loop = this.loopingVoices.get(padId)
    if (!loop) return
    this.loopingVoices.delete(padId)
    // Every loop of the pad — including one still handing over to a re-trimmed cycle.
    for (const voice of this.voices) if (voice.padId === padId && voice.loop) voice.release()
    this.notify()
  }

  /**
   * "Playthrough recording" (see RecordFAB / the transport toggle): instead of
   * recording from the microphone, holding the record FAB captures whatever's
   * actually audible from the app itself for the duration of the hold — every
   * currently-looping pad plus every manual tap/gate, mixed exactly as heard,
   * regardless of which pad-grid mode is active. Taps the master bus with a
   * MediaStreamAudioDestinationNode and records that stream with MediaRecorder
   * — the same mechanism useRecorder.ts already uses for the mic, just fed a
   * synthetic Web Audio stream instead of getUserMedia, so it needs no
   * microphone permission at all.
   */
  startPlaythroughRecording(): void {
    const ctx = this.getContext()
    this.getMasterBus()
    const recordTap = ctx.createMediaStreamDestination()
    // After the master stage: the recording is exactly the mix as heard (before the listening volume).
    this.masterStage!.output.connect(recordTap)
    this.recordTap = recordTap
    this.playthroughChunks = []

    const recorder = new MediaRecorder(recordTap.stream)
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.playthroughChunks.push(event.data)
    }
    recorder.start()
    this.playthroughRecorder = recorder
  }

  stopPlaythroughRecording(): Promise<ArrayBuffer> {
    return new Promise((resolve) => {
      const recorder = this.playthroughRecorder
      if (!recorder) {
        resolve(new ArrayBuffer(0))
        return
      }
      recorder.onstop = () => {
        void (async () => {
          const blob = new Blob(this.playthroughChunks, { type: recorder.mimeType })
          const arrayBuffer = await blob.arrayBuffer()
          if (this.recordTap) this.masterStage?.output.disconnect(this.recordTap)
          this.recordTap = null
          this.playthroughRecorder = null
          this.playthroughChunks = []
          resolve(arrayBuffer)
        })()
      }
      recorder.stop()
    })
  }

  /**
   * The panic-stop button's action: silences everything currently audible —
   * every looping pad, every in-flight one-shot (a manual tap, a sequencer hit,
   * a long recording still playing out), all at once. Deliberately stops
   * every note (with a short fade, so even panic doesn't click), the preview
   * sources, and the echo/reverb tails held in the channel strips.
   */
  stopAllSounds(): void {
    this.performer?.stopAll()
    this.loopingVoices.clear()
    for (const voice of this.voices) voice.release(RELEASE_SECONDS)
    for (const source of Array.from(this.activeSources)) {
      try {
        source.stop()
      } catch {
        // Already stopped/ended between the snapshot above and this call — fine.
      }
    }
    // Echo and reverb tails live in the channels and rooms: fade them out,
    // then drop them entirely — fresh ones are built on the next note.
    const channels = [...this.channels.values()]
    const rooms = this.rooms
    this.channels.clear()
    this.rooms = null
    for (const channel of channels) channel.fadeOut(0.03)
    setTimeout(() => {
      for (const channel of channels) channel.dispose()
      rooms?.dispose()
    }, 80)
    this.notify()
  }
}
