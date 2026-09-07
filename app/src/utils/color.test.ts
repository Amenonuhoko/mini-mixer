import { describe, expect, it } from 'vitest'
import { contrastingTextColor } from './color'

describe('contrastingTextColor', () => {
  it('picks white text on truly dark backgrounds', () => {
    expect(contrastingTextColor('#000000')).toBe('#ffffff')
    expect(contrastingTextColor('#111111')).toBe('#ffffff')
  })

  it('picks dark text on white', () => {
    expect(contrastingTextColor('#ffffff')).toBe('#12121a')
  })

  it('picks dark text for every color in the pad palette', () => {
    // Vivid/saturated colors "look bright" perceptually but stay low in
    // gamma-corrected relative luminance — every current pad color falls
    // below the white-vs-black crossover, so dark text wins across the board.
    const palette = [
      '#ef4444',
      '#f97316',
      '#eab308',
      '#22c55e',
      '#14b8a6',
      '#3b82f6',
      '#8b5cf6',
      '#ec4899',
    ]
    for (const color of palette) {
      expect(contrastingTextColor(color)).toBe('#12121a')
    }
  })
})
