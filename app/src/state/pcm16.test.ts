import { describe, expect, it } from 'vitest'
import { decodePcm16, encodePcm16 } from './pcm16'

describe('pcm16', () => {
  it('round-trips audio to within one 16-bit step', () => {
    const source = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 7) * 0.8)
    const restored = decodePcm16(encodePcm16(source))
    expect(restored.length).toBe(source.length)
    for (let i = 0; i < source.length; i++) expect(Math.abs(restored[i]! - source[i]!)).toBeLessThanOrEqual(1 / 32767)
  })

  it('keeps silence exactly silent and full scale at full scale', () => {
    const encoded = encodePcm16(Float32Array.from([0, 1, -1]))
    expect(Array.from(encoded)).toEqual([0, 32767, -32768])
    expect(Array.from(decodePcm16(encoded))).toEqual([0, 1, -1])
  })

  it('clamps anything beyond full scale instead of wrapping', () => {
    const restored = decodePcm16(encodePcm16(Float32Array.from([1.5, -1.5, 2])))
    expect(Array.from(restored)).toEqual([1, -1, 1])
  })
})
