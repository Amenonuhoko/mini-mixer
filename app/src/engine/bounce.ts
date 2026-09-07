import type { EffectId, EffectSetting } from '../state/types'
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

/**
 * One pad hit captured during a performance recording (see AudioEngine's
 * startPerformanceCapture/logPerformanceHit). Deliberately decoupled from
 * AudioEngine and the live AudioContext, the same way engine/synth.ts renders
 * instrument keys offline — this module only needs OfflineAudioContext.
 */
export interface PerformanceHit {
  padId: string
  buffer: AudioBuffer
  effects: EffectSetting[]
  trimStart: number
  trimEnd: number
  /** Seconds from the start of the recording. */
  offsetSeconds: number
  /** Seconds held for (a gate); null means play the full trimmed window (a quick tap). */
  durationSeconds: number | null
}

function effectValue(effects: EffectSetting[], id: EffectId): number {
  return effects.find((effect) => effect.id === id)?.value ?? 0
}

/** Small buffer of silence after the last hit so its tail (echo, natural decay) isn't cut off. */
const TAIL_SECONDS = 0.15

/**
 * Renders a captured performance down to a single AudioBuffer, replaying each
 * hit's trim/effects at its recorded offset — the same node graph
 * AudioEngine.playBuffer wires up live, rebuilt here against an
 * OfflineAudioContext so many overlapping hits render deterministically and
 * fast (no real-time wait).
 */
export async function renderPerformance(hits: PerformanceHit[]): Promise<AudioBuffer> {
  if (hits.length === 0) throw new Error('renderPerformance: no hits to render')

  const sampleRate = hits[0]!.buffer.sampleRate
  const windows = hits.map((hit) => {
    const window = trimToPlaybackWindow(hit.trimStart, hit.trimEnd, hit.buffer.duration)
    const duration = Math.max(0.01, hit.durationSeconds ?? window.duration)
    return { window, duration }
  })
  const totalSeconds =
    Math.max(...hits.map((hit, i) => hit.offsetSeconds + windows[i]!.duration)) + TAIL_SECONDS

  const ctx = new OfflineAudioContext(2, Math.ceil(totalSeconds * sampleRate), sampleRate)

  hits.forEach((hit, i) => {
    const { window, duration } = windows[i]!
    const source = ctx.createBufferSource()
    source.buffer = hit.buffer
    source.playbackRate.value = dialToPlaybackRate(effectValue(hit.effects, 'speed'))
    source.detune.value = dialToDetuneCents(effectValue(hit.effects, 'pitch'))

    const filter = ctx.createBiquadFilter()
    const filterParams = dialToFilterParams(effectValue(hit.effects, 'filter'))
    filter.type = filterParams.type
    filter.frequency.value = filterParams.frequencyHz

    const shaper = ctx.createWaveShaper()
    shaper.curve = buildGritCurve(dialToGritParams(effectValue(hit.effects, 'grit')))
    shaper.oversample = '2x'

    const gain = ctx.createGain()
    gain.gain.value = dialToGain(effectValue(hit.effects, 'volume'))

    const delay = ctx.createDelay(1)
    const feedback = ctx.createGain()
    const wet = ctx.createGain()
    const echoParams = dialToEchoParams(effectValue(hit.effects, 'echo'))
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

    source.start(hit.offsetSeconds, window.offset, duration)
  })

  return ctx.startRendering()
}
