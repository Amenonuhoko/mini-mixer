import { describe, expect, it } from 'vitest'
import { RECORDED_KEYS } from './recordedKeys'
import { INSTRUMENT_GROUPS, INSTRUMENT_PRESETS, zoneShiftSemitones } from './synth'

describe('instrument presets', () => {
  it('lists every preset in exactly one picker group, and every group name is a preset', () => {
    const grouped = INSTRUMENT_GROUPS.flatMap((group) => group.names)
    expect(new Set(grouped).size).toBe(grouped.length)
    expect([...grouped].sort()).toEqual(INSTRUMENT_PRESETS.map((preset) => preset.name).sort())
  })

  it('points every recorded preset at a pack whose zones cover its range evenly', () => {
    for (const preset of INSTRUMENT_PRESETS) {
      if (!preset.recordedKeys) continue
      const zones = RECORDED_KEYS[preset.recordedKeys]
      expect(zones.length, preset.name).toBeGreaterThanOrEqual(6)
      const midis = zones.map((zone) => zone.midi)
      // Packs span at least an octave and a third with no hole wider than 14 semitones, so a note
      // inside the pack's range is never pitched more than a fifth from a recording.
      expect(Math.max(...midis) - Math.min(...midis), preset.name).toBeGreaterThanOrEqual(16)
      for (let i = 1; i < midis.length; i++) expect(midis[i]! - midis[i - 1]!, `${preset.name} zones ${midis[i - 1]}-${midis[i]}`).toBeLessThanOrEqual(14)
      for (const zone of zones) if ('cents' in zone) expect(Math.abs(zone.cents), zone.file).toBeLessThanOrEqual(65)
    }
  })

  it('cancels a zone\'s measured tuning offset when pitching it to a note', () => {
    expect(zoneShiftSemitones(62, { midi: 60, file: 'x.wav' })).toBe(2)
    expect(zoneShiftSemitones(62, { midi: 60, file: 'x.wav', cents: 25 })).toBeCloseTo(1.75)
    expect(zoneShiftSemitones(60, { midi: 60, file: 'x.wav', cents: -12 })).toBeCloseTo(0.12)
    expect(zoneShiftSemitones(60, { midi: 60, file: 'x.wav' })).toBe(0)
  })

  it('keeps every synth patch inside its total duration and names unique presets', () => {
    const names = INSTRUMENT_PRESETS.map((preset) => preset.name)
    expect(new Set(names).size).toBe(names.length)
    for (const { name, patch } of INSTRUMENT_PRESETS) {
      expect(patch.attackSeconds + patch.decaySeconds, name).toBeLessThanOrEqual(patch.totalDurationSeconds)
      expect(patch.releaseSeconds, name).toBeLessThanOrEqual(patch.totalDurationSeconds)
    }
  })
})
