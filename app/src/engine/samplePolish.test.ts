import { describe, expect, it } from 'vitest'
import { polishSample } from './samplePolish'
import { queuedRender } from './renderQueue'

function buffer(channels: Float32Array[]): AudioBuffer {
  return {
    numberOfChannels: channels.length,
    length: channels[0]!.length,
    sampleRate: 44100,
    getChannelData: (index: number) => channels[index]!,
  } as AudioBuffer
}

describe('sample polish', () => {
  it('removes hard edges and preserves stereo balance under a common peak ceiling', () => {
    const left = Float32Array.from({ length: 4410 }, (_, i) => 0.2 + Math.sin(i * 0.13))
    const right = Float32Array.from(left, (value) => value * 0.5)
    polishSample(buffer([left, right]))
    expect(left[0]).toBeCloseTo(0)
    expect(left.at(-1)).toBeCloseTo(0)
    expect(Math.max(...left.map(Math.abs))).toBeLessThanOrEqual(0.801)
    expect(right[1000]! / left[1000]!).toBeCloseTo(0.5)
    expect(Math.abs(left.at(-2)!)).toBeLessThan(0.002)
  })

  it('leaves silence and DC-only buffers silent without producing NaN', () => {
    for (const value of [0, 0.3]) {
      const data = new Float32Array(3000).fill(value)
      polishSample(buffer([data]))
      expect(data.every((sample) => Number.isFinite(sample) && Math.abs(sample) < 1e-6)).toBe(true)
    }
  })
})

it('limits bank rendering concurrency and releases its slot after a failure', async () => {
  let active = 0
  let peak = 0
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, (_, index) =>
      queuedRender(async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 2))
        active--
        if (index === 2) throw new Error('bad sample')
        return index
      }),
    ),
  )
  expect(peak).toBeLessThanOrEqual(2)
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(7)
  expect(await queuedRender(() => 'still works')).toBe('still works')
})
