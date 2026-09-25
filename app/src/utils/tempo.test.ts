import { describe, expect, it } from 'vitest'
import { BPM_MAX, BPM_MIN } from '../state/constants'
import { holdStep, scaleBpm, tapTempo, TEMPO_FEEL } from './tempo'

describe('holdStep', () => {
  it('steps by one at first', () => {
    expect(holdStep(120, -1, 0)).toBe(119)
    expect(holdStep(120, 1, 500)).toBe(121)
  })

  it('jumps in snapped coarse steps once held a while', () => {
    const later = TEMPO_FEEL.coarseAfterMs + 1
    expect(holdStep(118, -1, later)).toBe(115)
    expect(holdStep(115, -1, later)).toBe(110)
    expect(holdStep(118, 1, later)).toBe(120)
    expect(holdStep(120, 1, later)).toBe(125)
  })

  it('stays inside the tempo range', () => {
    expect(holdStep(BPM_MIN, -1, 5000)).toBe(BPM_MIN)
    expect(holdStep(BPM_MAX, 1, 5000)).toBe(BPM_MAX)
  })
})

describe('scaleBpm', () => {
  it('halves and doubles within range', () => {
    expect(scaleBpm(140, 0.5)).toBe(70)
    expect(scaleBpm(87, 0.5)).toBe(44)
    expect(scaleBpm(60, 0.5)).toBe(BPM_MIN)
    expect(scaleBpm(150, 2)).toBe(BPM_MAX)
  })
})

describe('tapTempo', () => {
  it('needs two taps, then averages the latest intervals', () => {
    expect(tapTempo([1000])).toBeNull()
    expect(tapTempo([0, 500])).toBe(120)
    expect(tapTempo([0, 600, 1100, 1600, 2100])).toBe(114)
    // Only the latest intervals count.
    expect(tapTempo([0, 2000, 2500, 3000, 3500, 4000])).toBe(120)
  })
})
