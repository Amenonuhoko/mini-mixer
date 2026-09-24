import { describe, expect, it } from 'vitest'
import { bankLayout, type MusicalKey } from '../music/theory'
import { DRUM_KITS } from './drumSynth'
import { LOOP_PRESETS, loopPresetBankKind, loopPresetStepsByPadIndex } from './loopPresets'

const C_MAJOR: MusicalKey = { tonic: 0, scale: 'major', chordColor: 'triad' }

describe('loopPresetStepsByPadIndex', () => {
  it('puts drum hits on the pad playing that kit voice', () => {
    const preset = LOOP_PRESETS.find((item) => item.id === 'loop_four_on_floor')!
    const kit = DRUM_KITS.find((item) => item.id === 'acoustic-drums')!
    const pads = kit.voices.map(() => ({ music: null }))
    const steps = loopPresetStepsByPadIndex(preset, { kind: 'drums', sound: { type: 'kit', kitId: kit.id } }, pads, 0)
    const kick = kit.voices.findIndex((voice) => voice.name === 'Kick')
    expect(steps[kick]).toEqual([0, 4, 8, 12])
  })

  it('lands every tone hit on a pad in the key, following the tonic', () => {
    for (const preset of LOOP_PRESETS.filter((item) => item.category !== 'Drums')) {
      const kind = loopPresetBankKind(preset) as 'bass' | 'melody'
      const layout = bankLayout(kind, C_MAJOR, 'guided')
      const steps = loopPresetStepsByPadIndex(preset, { kind, sound: { type: 'preset', name: 'Piano' } }, layout.pads.map((music) => ({ music })), 0)
      const placed = Object.values(steps).reduce((total, list) => total + list.length, 0)
      expect(placed).toBe(preset.steps.length)
    }
  })
})
