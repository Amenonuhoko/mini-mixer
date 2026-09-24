import { describe, expect, it } from 'vitest'
import { seamlessCycle } from './loopSeam'

const RATE = 48000

/** A sine that doesn't fit the loop a whole number of times — the classic clicking loop. */
function sine(length: number, hz = 220): Float32Array {
  return Float32Array.from({ length }, (_, i) => Math.sin((2 * Math.PI * hz * i) / RATE))
}

/** The biggest sample-to-sample jump when the cycle wraps from its end to its start. */
function seamJump(cycle: Float32Array): number {
  return Math.abs(cycle[0]! - cycle[cycle.length - 1]!)
}

describe('seamlessCycle', () => {
  it('keeps the loop length exactly', () => {
    const [out] = seamlessCycle([sine(48000)], 4800, 30000, RATE)
    expect(out!.length).toBe(25200)
  })

  it('crossfades a trimmed loop into the audio before its start — no jump at the seam', () => {
    const data = sine(48000)
    const start = 4801
    const end = 30017
    expect(Math.abs(data[start]! - data[end - 1]!)).toBeGreaterThan(0.05) // a plain loop would click
    const [out] = seamlessCycle([data], start, end, RATE)
    // The wrap now steps like any neighbouring pair of samples does.
    const step = Math.abs(data[start]! - data[start - 1]!)
    expect(seamJump(out!)).toBeLessThanOrEqual(step * 1.5 + 1e-3)
  })

  it('fades an untrimmed loop in and out at the seam', () => {
    const data = Float32Array.from({ length: 9600 }, () => 0.8)
    const [out] = seamlessCycle([data], 0, 9600, RATE)
    expect(out![0]).toBe(0)
    expect(Math.abs(out![out!.length - 1]!)).toBeLessThan(0.01)
    expect(out![4800]).toBeCloseTo(0.8)
  })

  it('leaves the middle of the loop untouched', () => {
    const data = sine(48000)
    const [out] = seamlessCycle([data], 4800, 30000, RATE)
    expect(out![10000]).toBe(data[14800])
  })
})
