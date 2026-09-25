/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { RECORDED_KEYS } from './recordedKeys'
import { INSTRUMENT_PRESETS, renderPresetNotes } from './synth'

describe('bundled acoustic recordings', () => {
  it('ships playable compact WAV zones with silent edges and headroom', () => {
    let bytes = 0
    for (const zones of Object.values(RECORDED_KEYS)) for (const zone of zones) {
      const file = readFileSync(new URL('../../public/instruments/' + zone.file, import.meta.url))
      bytes += file.length
      expect(file.toString('ascii', 0, 4)).toBe('RIFF')
      expect(file.readUInt16LE(22)).toBe(1)
      expect(file.readUInt32LE(24)).toBe(44100)
      expect(file.readInt16LE(44)).toBe(0)
      expect(file.readInt16LE(file.length - 2)).toBe(0)
      let peak = 0
      for (let i = 44; i < file.length; i += 2) peak = Math.max(peak, Math.abs(file.readInt16LE(i)))
      expect(peak).toBeGreaterThan(1000)
      expect(peak).toBeLessThanOrEqual(24576)
    }
    expect(bytes).toBeLessThan(8_000_000)
  })
  it('reports a recording failure instead of silently changing the instrument into a synth', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    try {
      await expect(renderPresetNotes(INSTRUMENT_PRESETS.find((p) => p.name === 'Piano')!, [60])).rejects.toThrow('real Piano recordings')
    } finally { vi.unstubAllGlobals() }
  })
})
