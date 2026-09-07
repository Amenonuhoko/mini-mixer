import { describe, expect, it } from 'vitest'
import {
  buildGritCurve,
  dialToDetuneCents,
  dialToEchoParams,
  dialToFilterParams,
  dialToGain,
  dialToGritParams,
  dialToPlaybackRate,
} from './dialMapping'

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

describe('dialToGain', () => {
  it('is unity (1x) at neutral (0)', () => {
    expect(dialToGain(0)).toBe(1)
  })
  it('is silent at -100 and a 2x boost at +100', () => {
    expect(dialToGain(-100)).toBeCloseTo(0)
    expect(dialToGain(100)).toBeCloseTo(2)
  })
  it('is monotonically increasing', () => {
    expect(dialToGain(-25)).toBeLessThan(dialToGain(25))
  })
})

describe('dialToGritParams', () => {
  it('is clean with zero amount at neutral (0)', () => {
    expect(dialToGritParams(0)).toEqual({ mode: 'clean', amount: 0 })
  })
  it('crushes below neutral, amount growing as the dial goes further negative', () => {
    expect(dialToGritParams(-50).mode).toBe('crush')
    expect(dialToGritParams(-100).amount).toBeCloseTo(1)
    expect(dialToGritParams(-25).amount).toBeLessThan(dialToGritParams(-100).amount)
  })
  it('drives above neutral, amount growing as the dial goes further positive', () => {
    expect(dialToGritParams(50).mode).toBe('drive')
    expect(dialToGritParams(100).amount).toBeCloseTo(1)
    expect(dialToGritParams(25).amount).toBeLessThan(dialToGritParams(100).amount)
  })
})

describe('buildGritCurve', () => {
  it('is the identity curve when clean', () => {
    const curve = buildGritCurve({ mode: 'clean', amount: 0 })
    expect(curve[0]).toBeCloseTo(-1)
    expect(curve[curve.length - 1]).toBeCloseTo(1)
    expect(curve[Math.floor(curve.length / 2)]).toBeCloseTo(0, 1)
  })
  it('quantizes into audibly fewer distinct output values as crush amount increases', () => {
    const mild = buildGritCurve({ mode: 'crush', amount: 0.1 })
    const harsh = buildGritCurve({ mode: 'crush', amount: 0.9 })
    const distinctValues = (curve: Float32Array) => new Set(Array.from(curve)).size
    expect(distinctValues(harsh)).toBeLessThan(distinctValues(mild))
  })
  it('stays within -1..1 when driven', () => {
    const curve = buildGritCurve({ mode: 'drive', amount: 1 })
    for (const sample of curve) {
      expect(sample).toBeGreaterThanOrEqual(-1)
      expect(sample).toBeLessThanOrEqual(1)
    }
  })
})

describe('dialToEchoParams', () => {
  it('is fully dry at neutral (0)', () => {
    expect(dialToEchoParams(0).wetMix).toBe(0)
    expect(dialToEchoParams(0).feedback).toBe(0)
  })
  it('is a short slapback below neutral and a longer delay above it', () => {
    expect(dialToEchoParams(-100).delaySeconds).toBeLessThan(dialToEchoParams(100).delaySeconds)
  })
  it('wet mix grows with distance from neutral in either direction', () => {
    expect(dialToEchoParams(-50).wetMix).toBeGreaterThan(0)
    expect(dialToEchoParams(50).wetMix).toBeGreaterThan(0)
    expect(dialToEchoParams(100).wetMix).toBeGreaterThan(dialToEchoParams(50).wetMix)
  })
})
