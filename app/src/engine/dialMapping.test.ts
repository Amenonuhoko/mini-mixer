import { describe, expect, it } from 'vitest'
import { dialToDetuneCents, dialToFilterFrequencyHz, dialToPlaybackRate } from './dialMapping'

describe('dialToDetuneCents', () => {
  it('is 0 cents at the neutral midpoint', () => {
    expect(dialToDetuneCents(50)).toBe(0)
  })
  it('is negative below neutral and positive above it', () => {
    expect(dialToDetuneCents(0)).toBeLessThan(0)
    expect(dialToDetuneCents(100)).toBeGreaterThan(0)
  })
  it('spans a full octave (+/- 1200 cents) at the extremes', () => {
    expect(dialToDetuneCents(0)).toBe(-1200)
    expect(dialToDetuneCents(100)).toBe(1200)
  })
})

describe('dialToPlaybackRate', () => {
  it('is 1x at the neutral midpoint', () => {
    expect(dialToPlaybackRate(50)).toBe(1)
  })
  it('is 0.5x at the bottom and 2x at the top', () => {
    expect(dialToPlaybackRate(0)).toBeCloseTo(0.5)
    expect(dialToPlaybackRate(100)).toBeCloseTo(2)
  })
  it('is monotonically increasing', () => {
    expect(dialToPlaybackRate(25)).toBeLessThan(dialToPlaybackRate(75))
  })
})

describe('dialToFilterFrequencyHz', () => {
  it('is 200Hz at 0 and 20000Hz at 100', () => {
    expect(dialToFilterFrequencyHz(0)).toBeCloseTo(200)
    expect(dialToFilterFrequencyHz(100)).toBeCloseTo(20000)
  })
  it('is monotonically increasing', () => {
    expect(dialToFilterFrequencyHz(25)).toBeLessThan(dialToFilterFrequencyHz(75))
  })
})
