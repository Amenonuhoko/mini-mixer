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
    expect(bytes).toBeLessThan(60_000_000)
  })
  it('keeps every wind and string zone at its labelled pitch: fundamental present, in tune once its offset is cancelled, and no octave underneath', () => {
    const kinds = ['flute', 'clarinet', 'trumpet', 'sax', 'guitar', 'bass', 'oboe', 'bassoon', 'horn', 'trombone', 'harmonica', 'cello', 'pizzicato', 'upright', 'pipeorgan', 'harpsichord'] as const
    for (const kind of kinds) for (const zone of RECORDED_KEYS[kind]) {
      const wav = readFileSync(new URL('../../public/instruments/' + zone.file, import.meta.url))
      // A Hann-windowed 0.74 s from 0.1 s in, measured by direct evaluation at each frequency of interest.
      const count = 32768
      const samples = Float64Array.from({ length: count }, (_, i) => 44 + 2 * (4410 + i) + 1 < wav.length ? wav.readInt16LE(44 + 2 * (4410 + i)) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / count)) : 0)
      const magnitude = (hz: number) => {
        const step = (2 * Math.PI * hz) / 44100
        let re = 0, im = 0, cos = 1, sin = 0
        const dc = Math.cos(step), ds = Math.sin(step)
        for (let i = 0; i < count; i++) {
          re += samples[i]! * cos
          im -= samples[i]! * sin
          const next = cos * dc - sin * ds
          sin = sin * dc + cos * ds
          cos = next
        }
        return Math.hypot(re, im)
      }
      // The strongest response within ±60 cents of a frequency, on a 5-cent grid, and where it sits.
      const peak = (hz: number) => {
        let best = { hz, level: 0 }
        for (let cents = -60; cents <= 60; cents += 5) {
          const level = magnitude(hz * 2 ** (cents / 1200))
          if (level > best.level) best = { hz: hz * 2 ** (cents / 1200), level }
        }
        return best
      }
      const hz = 440 * 2 ** ((zone.midi - 69) / 12) * 2 ** (('cents' in zone ? zone.cents : 0) / 1200)
      const harmonics = [1, 2, 3].map((k) => ({ k, ...peak(hz * k) }))
      const strongest = harmonics.reduce((a, b) => (b.level > a.level ? b : a))
      // Twice the energy between harmonics: a plucked bass's attack thump is broadband down there.
      expect(strongest.level, `${zone.file}: no tone at its labelled pitch`).toBeGreaterThan(Math.max(peak(hz * 1.25).level, peak(hz * 1.75).level) * 2)
      // A note an octave above the label would leave nothing at the first and third harmonics (a low
      // bassoon or horn note has a faint fundamental but a strong third); one an octave below would
      // put its own third harmonic halfway between the label's first two.
      expect(Math.max(harmonics[0]!.level, harmonics[2]!.level), `${zone.file}: sounds an octave above its label`).toBeGreaterThan(strongest.level * 0.05)
      expect(peak(hz * 1.5).level, `${zone.file}: sounds an octave below its label`).toBeLessThan(Math.max(harmonics[0]!.level, harmonics[1]!.level) * 0.6)
      const cents = 1200 * Math.log2(strongest.hz / (hz * strongest.k))
      expect(Math.abs(cents), `${zone.file}: ${cents.toFixed(0)} cents off after correction`).toBeLessThan(40)
    }
  })
  it('reports a recording failure instead of silently changing the instrument into a synth', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    try {
      await expect(renderPresetNotes(INSTRUMENT_PRESETS.find((p) => p.name === 'Piano')!, [60])).rejects.toThrow('real Piano recordings')
    } finally { vi.unstubAllGlobals() }
  })
})
