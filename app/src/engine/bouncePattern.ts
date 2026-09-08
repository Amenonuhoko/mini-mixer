import type { AppState, EffectId, EffectSetting, Pad, Sample } from '../state/types'
import {
  buildGritCurve,
  buildReverbImpulse,
  dialToDetuneCents,
  dialToEchoParams,
  dialToFilterParams,
  dialToGain,
  dialToGritParams,
  dialToPan,
  dialToPlaybackRate,
  dialToReverbParams,
  mixLevelToGain,
} from './dialMapping'
import { trimToPlaybackWindow } from './trim'

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
  const pads = state.pads.slice(0, state.visiblePadCount)

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

  hits.forEach((hit, i) => {
    const { pad, sample, offsetSeconds } = hit
    const window = windows[i]!
    const effects = pad.effectsBypassed ? [] : pad.effects

    const source = ctx.createBufferSource()
    source.buffer = sample.buffer
    source.playbackRate.value = dialToPlaybackRate(effectValue(effects, 'speed'))
    source.detune.value = dialToDetuneCents(effectValue(effects, 'pitch'))

    const filter = ctx.createBiquadFilter()
    const filterParams = dialToFilterParams(effectValue(effects, 'filter'))
    filter.type = filterParams.type
    filter.frequency.value = filterParams.frequencyHz

    const shaper = ctx.createWaveShaper()
    shaper.curve = buildGritCurve(dialToGritParams(effectValue(effects, 'grit')))
    shaper.oversample = '2x'

    const gain = ctx.createGain()
    gain.gain.value = dialToGain(effectValue(effects, 'volume'))

    const delay = ctx.createDelay(1)
    const feedback = ctx.createGain()
    const wet = ctx.createGain()
    const echoParams = dialToEchoParams(effectValue(effects, 'echo'))
    delay.delayTime.value = echoParams.delaySeconds
    feedback.gain.value = echoParams.feedback
    wet.gain.value = echoParams.wetMix

    const convolver = ctx.createConvolver()
    const reverbWet = ctx.createGain()
    const reverbParams = dialToReverbParams(effectValue(effects, 'reverb'))
    convolver.buffer = buildReverbImpulse(ctx, reverbParams.decaySeconds)
    reverbWet.gain.value = reverbParams.wetMix

    const mixGain = ctx.createGain()
    mixGain.gain.value = mixLevelToGain(pad.mixLevel)

    const panner = ctx.createStereoPanner()
    panner.pan.value = dialToPan(effectValue(effects, 'pan'))

    source.connect(filter)
    filter.connect(shaper)
    shaper.connect(gain)
    gain.connect(mixGain)
    gain.connect(delay)
    delay.connect(feedback)
    feedback.connect(delay)
    delay.connect(wet)
    wet.connect(mixGain)
    gain.connect(convolver)
    convolver.connect(reverbWet)
    reverbWet.connect(mixGain)
    mixGain.connect(panner)
    panner.connect(ctx.destination)

    source.start(offsetSeconds, window.offset, Math.max(0.01, window.duration))
  })

  return ctx.startRendering()
}
