import type { AppState, EffectId, EffectSetting, Pad, Sample } from '../state/types'
import { Channel, createMasterStage, ReverbRooms, shapeEnvelope } from './channel'
import { dialToDetuneCents, dialToPlaybackRate } from './dialMapping'
import { trimToPlaybackWindow } from './trim'
import { playablePads } from '../state/banks'

function effectValue(effects: EffectSetting[], id: EffectId): number {
  return effects.find((effect) => effect.id === id)?.value ?? 0
}

interface ScheduledHit {
  pad: Pad
  sample: Sample
  offsetSeconds: number
}

/**
 * "Bounce to Pad" — renders the current pattern (as programmed, at the
 * current BPM, respecting each pad's mute/trim/effects/mix level exactly as
 * they'd sound played) down to a single AudioBuffer via OfflineAudioContext.
 * A sibling to Playthrough recording (captures a *live* performance) and the
 * Instrument Mode capture two rounds ago (captured *manual presses*) — this
 * one needs neither, since a programmed pattern's timing is already exact
 * data, not something that has to be listened to or played out in real time.
 * Deliberately its own small offline-rendering module rather than reusing
 * AudioEngine's playback graph directly, the same "decoupled, no live
 * AudioContext needed" shape as engine/synth.ts.
 */
export async function renderPatternToBuffer(state: AppState, patternId: string): Promise<AudioBuffer> {
  const pattern = state.patterns.find((p) => p.id === patternId)
  if (!pattern) throw new Error('renderPatternToBuffer: pattern not found')

  const secondsPerStep = 60 / state.transport.bpm / 4
  const pads = playablePads(state)

  const hits: ScheduledHit[] = []
  for (const pad of pads) {
    if (pad.muted) continue
    const steps = pattern.steps[pad.id] ?? []
    steps.forEach((sampleId, stepIndex) => {
      if (!sampleId) return
      const sample = state.samples[sampleId]
      if (sample) hits.push({ pad, sample, offsetSeconds: stepIndex * secondsPerStep })
    })
  }
  if (hits.length === 0) {
    throw new Error('renderPatternToBuffer: pattern has no active steps to bounce')
  }

  const sampleRate = hits[0]!.sample.buffer.sampleRate
  const patternSeconds = pattern.stepCount * secondsPerStep
  const windows = hits.map((hit) =>
    trimToPlaybackWindow(hit.pad.trimStart, hit.pad.trimEnd, hit.sample.buffer.duration),
  )
  const tailSeconds = 0.15
  const totalSeconds =
    Math.max(patternSeconds, ...hits.map((hit, i) => hit.offsetSeconds + windows[i]!.duration)) +
    tailSeconds

  const ctx = new OfflineAudioContext(2, Math.ceil(totalSeconds * sampleRate), sampleRate)

  // The same signal path as live playback (engine/channel.ts): one channel
  // strip per pad, three shared reverb rooms, the master stage — so a
  // bounce sounds exactly like the pattern did, and rendering it doesn't
  // build a reverb per hit.
  const master = createMasterStage(ctx)
  master.output.connect(ctx.destination)
  const limiter = master.input
  const rooms = new ReverbRooms(ctx, limiter)
  const channels = new Map<string, Channel>()

  hits.forEach((hit, i) => {
    const { pad, sample, offsetSeconds } = hit
    const window = windows[i]!
    const effects = pad.effectsBypassed ? [] : pad.effects

    let channel = channels.get(pad.id)
    if (!channel) {
      channel = new Channel(ctx, limiter, rooms)
      channel.applyEffects(effects, false)
      channel.setMixLevel(pad.mixLevel, false)
      channels.set(pad.id, channel)
    }

    const source = ctx.createBufferSource()
    source.buffer = sample.buffer
    const rate = dialToPlaybackRate(effectValue(effects, 'speed'))
    const detune = dialToDetuneCents(effectValue(effects, 'pitch'))
    source.playbackRate.value = rate
    source.detune.value = detune

    const env = ctx.createGain()
    env.gain.value = 0
    source.connect(env)
    env.connect(channel.input)
    const duration = Math.max(0.01, window.duration)
    shapeEnvelope(env.gain, offsetSeconds, 1, {
      fadeIn: window.offset > 0.001,
      end: pad.trimEnd < 1 ? offsetSeconds + duration / (rate * Math.pow(2, detune / 1200)) : null,
    })
    source.start(offsetSeconds, window.offset, duration)
  })

  return ctx.startRendering()
}
