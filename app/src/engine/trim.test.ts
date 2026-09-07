import { describe, expect, it } from 'vitest'
import { trimToPlaybackWindow } from './trim'

describe('trimToPlaybackWindow', () => {
  it('is the full buffer at the default (0, 1) trim', () => {
    const window = trimToPlaybackWindow(0, 1, 4)
    expect(window.offset).toBe(0)
    expect(window.duration).toBe(4)
    expect(window.loopStart).toBe(0)
    expect(window.loopEnd).toBe(4)
  })

  it('converts fractional trim to seconds against the buffer duration', () => {
    const window = trimToPlaybackWindow(0.25, 0.75, 8)
    expect(window.offset).toBe(2)
    expect(window.duration).toBe(4)
    expect(window.loopStart).toBe(2)
    expect(window.loopEnd).toBe(6)
  })

  it('never returns a negative duration', () => {
    const window = trimToPlaybackWindow(0.9, 0.9, 10)
    expect(window.duration).toBe(0)
  })
})
