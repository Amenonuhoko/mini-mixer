import { describe, expect, it } from 'vitest'
import { dialToDetuneCents, dialToFilterParams, dialToPlaybackRate } from './dialMapping'

describe('dialToDetuneCents', () => {
  it('is 0 cents at neutral (0)', () => {
    expect(dialToDetuneCents(0)).toBe(0)
  })
  it('is negative below neutral and positive above it', () => {
    expect(dialToDetuneCents(-50)).toBeLessThan(0)
    expect(dialToDetuneCents(50)).toBeGreaterThan(0)
  })
  it('spans a full octave (+/- 1200 cents) at the extremes', () => {
    expect(dialToDetuneCents(-100)).toBe(-1200)
    expect(dialToDetuneCents(100)).toBe(1200)
  })
})

describe('dialToPlaybackRate', () => {
  it('is 1x at neutral (0)', () => {
    expect(dialToPlaybackRate(0)).toBe(1)
  })
  it('is 0.5x at -100 and 2x at +100', () => {
    expect(dialToPlaybackRate(-100)).toBeCloseTo(0.5)
    expect(dialToPlaybackRate(100)).toBeCloseTo(2)
  })
  it('is monotonically increasing', () => {
    expect(dialToPlaybackRate(-25)).toBeLessThan(dialToPlaybackRate(25))
  })
})

describe('dialToFilterParams', () => {
  it('is neutral (allpass) at 0', () => {
    expect(dialToFilterParams(0).type).toBe('allpass')
  })
  it('is lowpass below neutral, cutoff dropping as the dial goes further negative', () => {
    expect(dialToFilterParams(-1).type).toBe('lowpass')
    expect(dialToFilterParams(-100).frequencyHz).toBeCloseTo(200)
    expect(dialToFilterParams(-100).frequencyHz).toBeLessThan(dialToFilterParams(-50).frequencyHz)
  })
  it('is highpass above neutral, cutoff rising as the dial goes further positive', () => {
    expect(dialToFilterParams(1).type).toBe('highpass')
    expect(dialToFilterParams(100).frequencyHz).toBeCloseTo(2000)
    expect(dialToFilterParams(50).frequencyHz).toBeLessThan(dialToFilterParams(100).frequencyHz)
  })
})
