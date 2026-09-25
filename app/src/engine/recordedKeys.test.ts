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
      expect(file.length).toBeLessThan(450_000)
      let peak = 0
      for (let i = 44; i < file.length; i += 2) peak = Math.max(peak, Math.abs(file.readInt16LE(i)))
      expect(peak).toBeGreaterThan(1000)
      expect(peak).toBeLessThanOrEqual(24576)
    }
    expect(bytes).toBeLessThan(27_000_000)
  })
  it('maps wind and fretted-string recordings to their sounding pitch, including upstream octave conventions', () => {
    for (const kind of ['flute', 'clarinet', 'trumpet', 'sax', 'guitar', 'bass'] as const) for (const zone of RECORDED_KEYS[kind]) {
      const wav = readFileSync(new URL('../../public/instruments/' + zone.file, import.meta.url))
      // Autocorrelation of the settled attack; the earliest strong period avoids
      // mistaking a stronger second/third harmonic for the instrument's note.
      const count = 4096
      const samples = Float64Array.from({ length: count }, (_, i) => wav.readInt16LE(44 + 2 * (8820 + i)))
      const hz = 440 * 2 ** ((zone.midi - 69) / 12)
      const maxLag = Math.ceil(44100 / hz * 2.2)
      const scores = Array.from({ length: maxLag + 1 }, (_, lag) => {
        let xy = 0, xx = 0, yy = 0
        for (let i = 0; i < count - maxLag; i++) {
          const x = samples[i]!, y = samples[i + lag]!
          xy += x * y; xx += x * x; yy += y * y
        }
        return xy / Math.sqrt(xx * yy)
      })
      const peaks = scores.flatMap((v, i) => i > 2 && v > scores[i - 1]! && v > scores[i + 1]! ? [i] : [])
      const best = Math.max(...peaks.map((i) => scores[i]!))
      const lag = peaks.find((i) => scores[i]! >= best * .95)!
      const cents = 1200 * Math.log2((44100 / lag) / hz)
      expect(Math.abs(cents), `${zone.file}: ${cents.toFixed(1)} cents`).toBeLessThan(55)
    }
  })
  it('reports a recording failure instead of silently changing the instrument into a synth', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    try {
      await expect(renderPresetNotes(INSTRUMENT_PRESETS.find((p) => p.name === 'Piano')!, [60])).rejects.toThrow('real Piano recordings')
    } finally { vi.unstubAllGlobals() }
  })
})
