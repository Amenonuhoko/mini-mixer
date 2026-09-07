import { describe, expect, it } from 'vitest'
import { computePeaks } from './waveform'

function fakeBuffer(samples: number[]): AudioBuffer {
  return {
    getChannelData: () => Float32Array.from(samples),
  } as unknown as AudioBuffer
}

describe('computePeaks', () => {
  it('returns the requested number of buckets', () => {
    const buffer = fakeBuffer(new Array(100).fill(0.5))
    expect(computePeaks(buffer, 10)).toHaveLength(10)
  })

  it('takes the max absolute value within each bucket', () => {
    const buffer = fakeBuffer([0.1, 0.9, -0.3, 0.2, 0.05, -0.6])
    const peaks = computePeaks(buffer, 2)
    expect(peaks[0]).toBeCloseTo(0.9)
    expect(peaks[1]).toBeCloseTo(0.6)
  })

  it('handles silence as all-zero peaks', () => {
    const buffer = fakeBuffer(new Array(20).fill(0))
    expect(computePeaks(buffer, 4).every((p) => p === 0)).toBe(true)
  })
})
