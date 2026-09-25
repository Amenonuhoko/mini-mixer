import { describe, expect, it, vi } from 'vitest'
import { Channel, ReverbRooms, shapeEnvelope } from './channel'
import { dialToReverbParams } from './dialMapping'

describe('ReverbRooms.weights', () => {
  it('sends a decay entirely to the nearest room at either end', () => {
    expect(ReverbRooms.weights(0.2)).toEqual([1, 0, 0])
    expect(ReverbRooms.weights(10)).toEqual([0, 0, 1])
  })

  it('splits a decay between the two rooms around it, always summing to one', () => {
    const weights = ReverbRooms.weights(1)
    expect(weights[0]).toBeGreaterThan(0)
    expect(weights[1]).toBeGreaterThan(0)
    expect(weights[2]).toBe(0)
    for (let value = -100; value <= 100; value += 5) {
      const total = ReverbRooms.weights(dialToReverbParams(value).decaySeconds).reduce((sum, w) => sum + w, 0)
      expect(total).toBeCloseTo(1)
    }
  })

  it('sweeps smoothly: a bigger room never gets less of a longer decay', () => {
    let previous = ReverbRooms.weights(0.6)
    for (let decay = 0.7; decay <= 3.2; decay += 0.1) {
      const next = ReverbRooms.weights(decay)
      expect(next[2]!).toBeGreaterThanOrEqual(previous[2]! - 1e-9)
      previous = next
    }
  })
})


it('keeps tiny trimmed notes envelopes ordered and ends at silence', () => {
  const times: number[] = []
  const values: number[] = []
  const param = {
    setValueAtTime: (value: number, time: number) => { times.push(time); values.push(value) },
    linearRampToValueAtTime: (value: number, time: number) => { times.push(time); values.push(value) },
  } as unknown as AudioParam
  shapeEnvelope(param, 1, .5, { fadeIn: true, end: 1.001 })
  expect(times).toEqual([...times].sort((a, b) => a - b))
  expect(times.at(-1)).toBe(1.001)
  expect(values.at(-1)).toBe(0)
})

it('does not allocate an echo loop for dry pads and initializes silent faders without a ramp', () => {
  const makeParam = () => ({ value: 1, cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() })
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: makeParam(), frequency: makeParam(), pan: makeParam(), delayTime: makeParam() })
  const ctx = { currentTime: 0, createGain: vi.fn(node), createBiquadFilter: vi.fn(node), createWaveShaper: vi.fn(node), createStereoPanner: vi.fn(node), createDelay: vi.fn(node) } as unknown as BaseAudioContext
  const output = node() as unknown as AudioNode
  const channel = new Channel(ctx, output, new ReverbRooms(ctx, output))
  channel.applyEffects([], true)
  channel.setMixLevel(0, true)
  expect(vi.mocked(ctx.createGain).mock.results[2]!.value.gain.value).toBe(0)
  expect(ctx.createDelay).not.toHaveBeenCalled()
  channel.setDial('echo', 50)
  channel.setDial('echo', 75)
  expect(ctx.createDelay).toHaveBeenCalledTimes(1)
  channel.dispose()
})
