import { describe, expect, it } from 'vitest'
import { ReverbRooms } from './channel'
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
