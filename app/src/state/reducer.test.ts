import { describe, expect, it } from 'vitest'
import { BPM_MAX, BPM_MIN, EFFECT_MAX, EFFECT_MIN, MIN_TRIM_GAP } from './constants'
import { createInitialState } from './defaults'
import { reducer } from './reducer'
import type { Instrument, Sample } from './types'

function makeSample(id: string): Sample {
  return {
    id,
    label: id,
    buffer: {} as AudioBuffer,
    recordedAt: 0,
    kind: 'recording',
    peaks: [],
  }
}

function makeInstrument(id: string, keySampleIds: string[]): Instrument {
  return { id, name: id, source: 'preset', keySampleIds }
}

describe('reducer', () => {
  it('assigns a library sample to a pad by reference, without removing it from the library', () => {
    const state = createInitialState(2)
    const sample = makeSample('sample_1')
    const padId = state.pads[0]!.id

    const afterAdd = reducer(state, { type: 'ADD_SAMPLE', sample })
    const afterAssign = reducer(afterAdd, {
      type: 'ASSIGN_SAMPLE_TO_PAD',
      padId,
      sampleId: sample.id,
    })

    expect(afterAssign.samples[sample.id]).toBe(sample)
    expect(afterAssign.pads[0]!.sampleId).toBe(sample.id)
    expect(afterAssign.sampleOrder).toEqual([sample.id])
  })

  it('resets a pad trim to (0, 1) whenever a sample is (re)assigned', () => {
    const state = createInitialState(1)
    const padId = state.pads[0]!.id
    const sample = makeSample('s1')

    let next = reducer(state, { type: 'ADD_SAMPLE', sample })
    next = reducer(next, { type: 'ASSIGN_SAMPLE_TO_PAD', padId, sampleId: sample.id })
    next = reducer(next, { type: 'SET_PAD_TRIM', padId, trimStart: 0.2, trimEnd: 0.8 })
    expect(next.pads[0]!.trimStart).toBe(0.2)
    expect(next.pads[0]!.trimEnd).toBe(0.8)

    const second = makeSample('s2')
    next = reducer(next, { type: 'ADD_SAMPLE', sample: second })
    next = reducer(next, { type: 'ASSIGN_SAMPLE_TO_PAD', padId, sampleId: second.id })
    expect(next.pads[0]!.trimStart).toBe(0)
    expect(next.pads[0]!.trimEnd).toBe(1)
  })

  it('clamps pad trim and keeps at least MIN_TRIM_GAP between start and end', () => {
    const state = createInitialState(1)
    const padId = state.pads[0]!.id

    const collapsed = reducer(state, { type: 'SET_PAD_TRIM', padId, trimStart: 0.5, trimEnd: 0.5 })
    expect(collapsed.pads[0]!.trimEnd - collapsed.pads[0]!.trimStart).toBeCloseTo(MIN_TRIM_GAP)

    const outOfRange = reducer(state, { type: 'SET_PAD_TRIM', padId, trimStart: -1, trimEnd: 2 })
    expect(outOfRange.pads[0]!.trimStart).toBe(0)
    expect(outOfRange.pads[0]!.trimEnd).toBe(1)

    const endPushedPastOne = reducer(state, {
      type: 'SET_PAD_TRIM',
      padId,
      trimStart: 0.99,
      trimEnd: 1.5,
    })
    expect(endPushedPastOne.pads[0]!.trimEnd).toBe(1)
    expect(endPushedPastOne.pads[0]!.trimStart).toBeCloseTo(1 - MIN_TRIM_GAP)
  })

  it('reassigning a pad does not delete the previous sample from the library', () => {
    const state = createInitialState(1)
    const padId = state.pads[0]!.id
    const first = makeSample('first')
    const second = makeSample('second')

    let next = reducer(state, { type: 'ADD_SAMPLE', sample: first })
    next = reducer(next, { type: 'ADD_SAMPLE', sample: second })
    next = reducer(next, { type: 'ASSIGN_SAMPLE_TO_PAD', padId, sampleId: first.id })
    next = reducer(next, { type: 'ASSIGN_SAMPLE_TO_PAD', padId, sampleId: second.id })

    expect(next.pads[0]!.sampleId).toBe(second.id)
    expect(next.samples[first.id]).toBe(first)
  })

  it('removing a sample drops it from sampleOrder and unassigns it from any pad', () => {
    const state = createInitialState(1)
    const padId = state.pads[0]!.id
    const sample = makeSample('doomed')

    let next = reducer(state, { type: 'ADD_SAMPLE', sample })
    next = reducer(next, { type: 'ASSIGN_SAMPLE_TO_PAD', padId, sampleId: sample.id })
    next = reducer(next, { type: 'REMOVE_SAMPLE', sampleId: sample.id })

    expect(next.samples[sample.id]).toBeUndefined()
    expect(next.sampleOrder).toEqual([])
    expect(next.pads[0]!.sampleId).toBeNull()
  })

  it('renames a sample, trimming whitespace, and ignores a blank name', () => {
    const state = createInitialState(1)
    const sample = makeSample('s1')
    let next = reducer(state, { type: 'ADD_SAMPLE', sample })

    next = reducer(next, { type: 'RENAME_SAMPLE', sampleId: sample.id, label: '  Kick  ' })
    expect(next.samples[sample.id]!.label).toBe('Kick')

    const unchanged = reducer(next, { type: 'RENAME_SAMPLE', sampleId: sample.id, label: '   ' })
    expect(unchanged.samples[sample.id]!.label).toBe('Kick')
  })

  it('moves a sample up/down in sampleOrder, and is a no-op at the boundaries', () => {
    const state = createInitialState(1)
    let next = reducer(state, { type: 'ADD_SAMPLE', sample: makeSample('a') })
    next = reducer(next, { type: 'ADD_SAMPLE', sample: makeSample('b') })
    next = reducer(next, { type: 'ADD_SAMPLE', sample: makeSample('c') })
    expect(next.sampleOrder).toEqual(['a', 'b', 'c'])

    next = reducer(next, { type: 'MOVE_SAMPLE', sampleId: 'b', direction: 'up' })
    expect(next.sampleOrder).toEqual(['b', 'a', 'c'])

    const atTop = reducer(next, { type: 'MOVE_SAMPLE', sampleId: 'b', direction: 'up' })
    expect(atTop.sampleOrder).toEqual(['b', 'a', 'c'])

    const atBottom = reducer(next, { type: 'MOVE_SAMPLE', sampleId: 'c', direction: 'down' })
    expect(atBottom.sampleOrder).toEqual(['b', 'a', 'c'])
  })

  it('toggles a step on and back off', () => {
    const state = createInitialState(1)
    const patternId = state.activePatternId
    const padId = state.pads[0]!.id

    const on = reducer(state, { type: 'TOGGLE_STEP', patternId, padId, stepIndex: 3 })
    expect(on.patterns[0]!.steps[padId]![3]).toBe(true)

    const off = reducer(on, { type: 'TOGGLE_STEP', patternId, padId, stepIndex: 3 })
    expect(off.patterns[0]!.steps[padId]![3]).toBe(false)
  })

  it('clears every step in a pattern across every pad it tracks', () => {
    const state = createInitialState(2)
    const patternId = state.activePatternId
    const padA = state.pads[0]!.id
    const padB = state.pads[1]!.id

    let next = reducer(state, { type: 'TOGGLE_STEP', patternId, padId: padA, stepIndex: 0 })
    next = reducer(next, { type: 'TOGGLE_STEP', patternId, padId: padA, stepIndex: 5 })
    next = reducer(next, { type: 'TOGGLE_STEP', patternId, padId: padB, stepIndex: 2 })

    const cleared = reducer(next, { type: 'CLEAR_PATTERN', patternId })
    expect(cleared.patterns[0]!.steps[padA]!.every((on) => !on)).toBe(true)
    expect(cleared.patterns[0]!.steps[padB]!.every((on) => !on)).toBe(true)
  })

  it('clamps BPM to the 40-240 range', () => {
    const state = createInitialState(1)
    const tooLow = reducer(state, { type: 'SET_BPM', bpm: 10 })
    const tooHigh = reducer(state, { type: 'SET_BPM', bpm: 999 })

    expect(tooLow.transport.bpm).toBe(BPM_MIN)
    expect(tooHigh.transport.bpm).toBe(BPM_MAX)
  })

  it('clamps a pad effect to the -100..100 range', () => {
    const state = createInitialState(1)
    const padId = state.pads[0]!.id
    const tooLow = reducer(state, { type: 'SET_PAD_EFFECT', padId, effectId: 'speed', value: -500 })
    const tooHigh = reducer(state, { type: 'SET_PAD_EFFECT', padId, effectId: 'speed', value: 500 })

    expect(tooLow.pads[0]!.effects.find((e) => e.id === 'speed')!.value).toBe(EFFECT_MIN)
    expect(tooHigh.pads[0]!.effects.find((e) => e.id === 'speed')!.value).toBe(EFFECT_MAX)
  })

  it('resetting dials returns every effect to neutral (0)', () => {
    const state = createInitialState(1)
    const padId = state.pads[0]!.id
    const dialed = reducer(state, { type: 'SET_PAD_EFFECT', padId, effectId: 'pitch', value: 75 })
    const reset = reducer(dialed, { type: 'RESET_PAD_EFFECTS', padId })

    expect(reset.pads[0]!.effects.every((e) => e.value === 0)).toBe(true)
  })

  it('toggles pad mute independently of loop/sample state', () => {
    const state = createInitialState(1)
    const padId = state.pads[0]!.id
    expect(state.pads[0]!.muted).toBe(false)

    const muted = reducer(state, { type: 'SET_PAD_MUTED', padId, muted: true })
    expect(muted.pads[0]!.muted).toBe(true)
  })

  it('enabling instrument mode turns off loop mode, and vice versa', () => {
    const state = createInitialState(1)
    expect(state.transport.padLoopModeEnabled).toBe(false)
    expect(state.transport.padInstrumentModeEnabled).toBe(false)

    const loopOn = reducer(state, { type: 'SET_PAD_LOOP_MODE_ENABLED', enabled: true })
    expect(loopOn.transport.padLoopModeEnabled).toBe(true)

    const instrumentOn = reducer(loopOn, {
      type: 'SET_PAD_INSTRUMENT_MODE_ENABLED',
      enabled: true,
    })
    expect(instrumentOn.transport.padInstrumentModeEnabled).toBe(true)
    expect(instrumentOn.transport.padLoopModeEnabled).toBe(false)

    const backToLoop = reducer(instrumentOn, { type: 'SET_PAD_LOOP_MODE_ENABLED', enabled: true })
    expect(backToLoop.transport.padLoopModeEnabled).toBe(true)
    expect(backToLoop.transport.padInstrumentModeEnabled).toBe(false)
  })

  it('Mixer Mode temporarily overlays an active instrument and restores it on exit', () => {
    const state = createInitialState(1)
    const key = makeSample('instrument_key')
    const instrument = makeInstrument('instrument', [key.id])

    let next = reducer(state, { type: 'ADD_INSTRUMENT', instrument, keySamples: [key] })
    next = reducer(next, { type: 'APPLY_INSTRUMENT_TO_PADS', instrumentId: instrument.id })
    next = reducer(next, { type: 'SET_PAD_INSTRUMENT_MODE_ENABLED', enabled: true })
    const padSampleId = next.pads[0]!.sampleId

    const mixerOn = reducer(next, { type: 'SET_PAD_MIXER_MODE_ENABLED', enabled: true })
    expect(mixerOn.transport.padMixerModeEnabled).toBe(true)
    expect(mixerOn.transport.padInstrumentModeEnabled).toBe(true)
    expect(mixerOn.pads[0]!.sampleId).toBe(padSampleId)

    const mixerOff = reducer(mixerOn, { type: 'SET_PAD_MIXER_MODE_ENABLED', enabled: false })
    expect(mixerOff.transport.padMixerModeEnabled).toBe(false)
    expect(mixerOff.transport.padInstrumentModeEnabled).toBe(true)
    expect(mixerOff.pads[0]!.sampleId).toBe(padSampleId)

    const loopOn = reducer(mixerOn, { type: 'SET_PAD_LOOP_MODE_ENABLED', enabled: true })
    expect(loopOn.transport.padLoopModeEnabled).toBe(true)
    expect(loopOn.transport.padMixerModeEnabled).toBe(false)
  })

  it('sets a pad mix level, clamped to 0-100', () => {
    const state = createInitialState(1)
    const padId = state.pads[0]!.id
    expect(state.pads[0]!.mixLevel).toBe(100)

    const lowered = reducer(state, { type: 'SET_PAD_MIX_LEVEL', padId, level: 42 })
    expect(lowered.pads[0]!.mixLevel).toBe(42)

    const tooHigh = reducer(state, { type: 'SET_PAD_MIX_LEVEL', padId, level: 500 })
    expect(tooHigh.pads[0]!.mixLevel).toBe(100)

    const tooLow = reducer(state, { type: 'SET_PAD_MIX_LEVEL', padId, level: -20 })
    expect(tooLow.pads[0]!.mixLevel).toBe(0)
  })

  it('toggles playthrough recording independently of loop/instrument mode', () => {
    const state = createInitialState(1)
    expect(state.transport.playthroughRecordingEnabled).toBe(false)

    const loopOn = reducer(state, { type: 'SET_PAD_LOOP_MODE_ENABLED', enabled: true })
    const playthroughOn = reducer(loopOn, {
      type: 'SET_PLAYTHROUGH_RECORDING_ENABLED',
      enabled: true,
    })
    expect(playthroughOn.transport.playthroughRecordingEnabled).toBe(true)
    // Not mutually exclusive with the grid mode — loop mode stays on.
    expect(playthroughOn.transport.padLoopModeEnabled).toBe(true)
  })

  it('toggles the metronome', () => {
    const state = createInitialState(1)
    expect(state.transport.metronomeEnabled).toBe(false)
    const on = reducer(state, { type: 'SET_METRONOME_ENABLED', enabled: true })
    expect(on.transport.metronomeEnabled).toBe(true)
  })

  it('toggles per-pad effects bypass without touching the stored dial values', () => {
    const state = createInitialState(1)
    const padId = state.pads[0]!.id
    const dialed = reducer(state, { type: 'SET_PAD_EFFECT', padId, effectId: 'filter', value: 75 })

    const bypassed = reducer(dialed, { type: 'SET_PAD_EFFECTS_BYPASSED', padId, bypassed: true })
    expect(bypassed.pads[0]!.effectsBypassed).toBe(true)
    expect(bypassed.pads[0]!.effects.find((e) => e.id === 'filter')!.value).toBe(75)

    const restored = reducer(bypassed, { type: 'SET_PAD_EFFECTS_BYPASSED', padId, bypassed: false })
    expect(restored.pads[0]!.effectsBypassed).toBe(false)
    expect(restored.pads[0]!.effects.find((e) => e.id === 'filter')!.value).toBe(75)
  })

  it('applies an effect preset to every visible pad, leaving hidden pads untouched', () => {
    const state = createInitialState(3)
    const shrunk = reducer(state, { type: 'SET_VISIBLE_PAD_COUNT', count: 2 })

    const applied = reducer(shrunk, {
      type: 'APPLY_EFFECT_PRESET_TO_ALL_PADS',
      filter: 75,
      grit: -25,
      echo: 0,
      reverb: 50,
    })

    for (const pad of applied.pads.slice(0, 2)) {
      expect(pad.effects.find((e) => e.id === 'filter')!.value).toBe(75)
      expect(pad.effects.find((e) => e.id === 'grit')!.value).toBe(-25)
      expect(pad.effects.find((e) => e.id === 'echo')!.value).toBe(0)
      expect(pad.effects.find((e) => e.id === 'reverb')!.value).toBe(50)
      // Pitch/Speed/Volume/Pan are left alone, same as the single-pad preset buttons.
      expect(pad.effects.find((e) => e.id === 'pitch')!.value).toBe(0)
      expect(pad.effects.find((e) => e.id === 'pan')!.value).toBe(0)
    }
    // The 3rd pad is beyond visiblePadCount and shouldn't be touched.
    expect(applied.pads[2]!.effects.find((e) => e.id === 'filter')!.value).toBe(0)
  })

  it('bypasses and restores every visible pad’s effects at once', () => {
    const state = createInitialState(2)
    const bypassed = reducer(state, { type: 'SET_ALL_PADS_EFFECTS_BYPASSED', bypassed: true })
    expect(bypassed.pads.every((pad) => pad.effectsBypassed)).toBe(true)

    const restored = reducer(bypassed, { type: 'SET_ALL_PADS_EFFECTS_BYPASSED', bypassed: false })
    expect(restored.pads.every((pad) => !pad.effectsBypassed)).toBe(true)
  })

  it('resets every visible pad’s effect dials to neutral, leaving hidden pads untouched', () => {
    const state = createInitialState(2)
    const visiblePadId = state.pads[0]!.id
    const hiddenPadId = state.pads[1]!.id
    let dialed = reducer(state, {
      type: 'SET_PAD_EFFECT',
      padId: visiblePadId,
      effectId: 'filter',
      value: 75,
    })
    dialed = reducer(dialed, { type: 'SET_PAD_EFFECT', padId: hiddenPadId, effectId: 'filter', value: 50 })
    const shrunk = reducer(dialed, { type: 'SET_VISIBLE_PAD_COUNT', count: 1 })

    const reset = reducer(shrunk, { type: 'RESET_ALL_PADS_EFFECTS' })
    expect(reset.pads[0]!.effects.find((e) => e.id === 'filter')!.value).toBe(0)
    // Pad 2 is beyond visiblePadCount (1) and shouldn't be reset.
    expect(reset.pads[1]!.effects.find((e) => e.id === 'filter')!.value).toBe(50)
  })

  it('adding an instrument registers its key samples in the library and the instrument itself', () => {
    const state = createInitialState(2)
    const keySamples = [makeSample('key_0'), makeSample('key_1')]
    const instrument = makeInstrument(
      'inst_1',
      keySamples.map((s) => s.id),
    )

    const next = reducer(state, { type: 'ADD_INSTRUMENT', instrument, keySamples })

    expect(next.instruments[instrument.id]).toBe(instrument)
    expect(next.instrumentOrder).toEqual([instrument.id])
    expect(next.samples['key_0']).toBe(keySamples[0])
    expect(next.samples['key_1']).toBe(keySamples[1])
    expect(next.sampleOrder).toEqual(['key_0', 'key_1'])
  })

  it('applying an instrument lays its keys across the visible pads in order, resetting trim', () => {
    const state = createInitialState(2)
    const keySamples = [makeSample('key_0'), makeSample('key_1'), makeSample('key_2')]
    const instrument = makeInstrument(
      'inst_1',
      keySamples.map((s) => s.id),
    )
    let next = reducer(state, { type: 'ADD_INSTRUMENT', instrument, keySamples })
    next = reducer(next, {
      type: 'SET_PAD_TRIM',
      padId: next.pads[0]!.id,
      trimStart: 0.3,
      trimEnd: 0.7,
    })

    const applied = reducer(next, { type: 'APPLY_INSTRUMENT_TO_PADS', instrumentId: instrument.id })

    expect(applied.pads[0]!.sampleId).toBe('key_0')
    expect(applied.pads[1]!.sampleId).toBe('key_1')
    expect(applied.pads[0]!.trimStart).toBe(0)
    expect(applied.pads[0]!.trimEnd).toBe(1)
    // Only visiblePadCount (2) pads are touched, even though the instrument has a 3rd key.
    expect(applied.pads).toHaveLength(2)
  })

  it('expands the visible pad grid to an instrument’s key count and initializes new pattern rows', () => {
    const state = createInitialState(2)
    const keySamples = Array.from({ length: 4 }, (_, index) => makeSample(`key_${index}`))
    const instrument = makeInstrument('four_key_instrument', keySamples.map((sample) => sample.id))
    let next = reducer(state, { type: 'ADD_INSTRUMENT', instrument, keySamples })
    next = reducer(next, { type: 'APPLY_INSTRUMENT_TO_PADS', instrumentId: instrument.id })

    expect(next.visiblePadCount).toBe(4)
    expect(next.pads).toHaveLength(4)
    expect(next.pads.map((pad) => pad.sampleId)).toEqual(keySamples.map((sample) => sample.id))
    expect(next.patterns[0]!.steps[next.pads[2]!.id]).toHaveLength(16)
    expect(next.patterns[0]!.steps[next.pads[3]!.id]).toHaveLength(16)
  })

  it('removing an instrument deletes its key samples too and unassigns any pad using one', () => {
    const state = createInitialState(1)
    const keySamples = [makeSample('key_0'), makeSample('key_1')]
    const instrument = makeInstrument(
      'inst_1',
      keySamples.map((s) => s.id),
    )
    let next = reducer(state, { type: 'ADD_INSTRUMENT', instrument, keySamples })
    next = reducer(next, {
      type: 'ASSIGN_SAMPLE_TO_PAD',
      padId: next.pads[0]!.id,
      sampleId: 'key_0',
    })

    const removed = reducer(next, { type: 'REMOVE_INSTRUMENT', instrumentId: instrument.id })

    expect(removed.instruments[instrument.id]).toBeUndefined()
    expect(removed.instrumentOrder).toEqual([])
    expect(removed.samples['key_0']).toBeUndefined()
    expect(removed.samples['key_1']).toBeUndefined()
    expect(removed.pads[0]!.sampleId).toBeNull()
  })

  it('tracks and clears the auto-built instrument id (InstrumentModeButton’s quick-build cleanup)', () => {
    const state = createInitialState(1)
    expect(state.transport.autoInstrumentId).toBeNull()

    const tracked = reducer(state, { type: 'SET_AUTO_INSTRUMENT_ID', instrumentId: 'inst_1' })
    expect(tracked.transport.autoInstrumentId).toBe('inst_1')

    const untracked = reducer(tracked, { type: 'SET_AUTO_INSTRUMENT_ID', instrumentId: null })
    expect(untracked.transport.autoInstrumentId).toBeNull()
  })

  it('clears the tracked auto-instrument id when that exact instrument is removed', () => {
    const state = createInitialState(1)
    const keySamples = [makeSample('auto_key_0')]
    const instrument = makeInstrument('auto_inst', ['auto_key_0'])
    let next = reducer(state, { type: 'ADD_INSTRUMENT', instrument, keySamples })
    next = reducer(next, { type: 'SET_AUTO_INSTRUMENT_ID', instrumentId: instrument.id })
    expect(next.transport.autoInstrumentId).toBe(instrument.id)

    const removed = reducer(next, { type: 'REMOVE_INSTRUMENT', instrumentId: instrument.id })
    expect(removed.transport.autoInstrumentId).toBeNull()
  })

  it('leaves the tracked auto-instrument id alone when a different instrument is removed', () => {
    const state = createInitialState(1)
    const autoKeySamples = [makeSample('auto_key_0')]
    const autoInstrument = makeInstrument('auto_inst', ['auto_key_0'])
    const otherKeySamples = [makeSample('other_key_0')]
    const otherInstrument = makeInstrument('other_inst', ['other_key_0'])

    let next = reducer(state, { type: 'ADD_INSTRUMENT', instrument: autoInstrument, keySamples: autoKeySamples })
    next = reducer(next, { type: 'ADD_INSTRUMENT', instrument: otherInstrument, keySamples: otherKeySamples })
    next = reducer(next, { type: 'SET_AUTO_INSTRUMENT_ID', instrumentId: autoInstrument.id })

    const removed = reducer(next, { type: 'REMOVE_INSTRUMENT', instrumentId: otherInstrument.id })
    expect(removed.transport.autoInstrumentId).toBe(autoInstrument.id)
  })

  it('shrinking pad count hides pads without discarding their data', () => {
    const state = createInitialState(4)
    const sample = makeSample('kept')
    const occupiedPadId = state.pads[3]!.id

    let next = reducer(state, { type: 'ADD_SAMPLE', sample })
    next = reducer(next, {
      type: 'ASSIGN_SAMPLE_TO_PAD',
      padId: occupiedPadId,
      sampleId: sample.id,
    })
    next = reducer(next, { type: 'SET_VISIBLE_PAD_COUNT', count: 2 })

    expect(next.visiblePadCount).toBe(2)
    expect(next.pads).toHaveLength(4)
    expect(next.pads[3]!.sampleId).toBe(sample.id)

    const grownBack = reducer(next, { type: 'SET_VISIBLE_PAD_COUNT', count: 4 })
    expect(grownBack.pads[3]!.sampleId).toBe(sample.id)
  })

  it('growing pad count past the number of pad slots creates new pads with empty steps in every pattern', () => {
    const state = createInitialState(1)
    const next = reducer(state, { type: 'SET_VISIBLE_PAD_COUNT', count: 3 })

    expect(next.pads).toHaveLength(3)
    const newPadId = next.pads[2]!.id
    expect(next.patterns[0]!.steps[newPadId]).toHaveLength(16)
    expect(next.patterns[0]!.steps[newPadId]!.every((step) => step === false)).toBe(true)
  })

  it('CLEAR_ALL resets to a fresh default state at the same visible pad count', () => {
    const state = createInitialState(3)
    const sample = makeSample('temp')
    const dirtied = reducer(state, { type: 'ADD_SAMPLE', sample })

    const cleared = reducer(dirtied, { type: 'CLEAR_ALL' })

    expect(cleared.samples).toEqual({})
    expect(cleared.sampleOrder).toEqual([])
    expect(cleared.visiblePadCount).toBe(3)
    expect(cleared.pads.every((pad) => pad.sampleId === null)).toBe(true)
  })
  it('restores pre-instrument pad content when a temporary instrument is removed for Mixer Mode', () => {
    const state = createInitialState(1)
    const padId = state.pads[0]!.id
    const original = makeSample('original')
    const key = makeSample('quick_key')
    const instrument = makeInstrument('quick_instrument', [key.id])

    let next = reducer(state, { type: 'ADD_SAMPLE', sample: original })
    next = reducer(next, { type: 'ASSIGN_SAMPLE_TO_PAD', padId, sampleId: original.id })
    next = reducer(next, { type: 'SET_PAD_TRIM', padId, trimStart: 0.2, trimEnd: 0.8 })
    const snapshot = {
      [padId]: { sampleId: original.id, trimStart: 0.2, trimEnd: 0.8 },
    }
    next = reducer(next, { type: 'ADD_INSTRUMENT', instrument, keySamples: [key] })
    next = reducer(next, { type: 'APPLY_INSTRUMENT_TO_PADS', instrumentId: instrument.id })
    next = reducer(next, {
      type: 'SET_AUTO_INSTRUMENT_ID',
      instrumentId: instrument.id,
      padSnapshot: snapshot,
    })
    next = reducer(next, { type: 'SET_PAD_MIXER_MODE_ENABLED', enabled: true })
    const restored = reducer(next, { type: 'REMOVE_INSTRUMENT', instrumentId: instrument.id })

    expect(restored.transport.padMixerModeEnabled).toBe(true)
    expect(restored.pads[0]!.sampleId).toBe(original.id)
    expect(restored.pads[0]!.trimStart).toBe(0.2)
    expect(restored.pads[0]!.trimEnd).toBe(0.8)
    expect(restored.samples[key.id]).toBeUndefined()
    expect(restored.transport.autoInstrumentPadSnapshot).toBeNull()
  })


  it('sets the master listening level within 0-100', () => {
    const state = createInitialState(1)

    expect(reducer(state, { type: 'SET_MASTER_VOLUME', level: 42 }).transport.masterVolume).toBe(42)
    expect(reducer(state, { type: 'SET_MASTER_VOLUME', level: -1 }).transport.masterVolume).toBe(0)
    expect(reducer(state, { type: 'SET_MASTER_VOLUME', level: 101 }).transport.masterVolume).toBe(100)
  })

  it('defaults normal pad presses to Gate and can switch them to one-shot', () => {
    const state = createInitialState(1)
    expect(state.transport.padPlaybackMode).toBe('gate')

    const oneShot = reducer(state, { type: 'SET_PAD_PLAYBACK_MODE', mode: 'oneshot' })
    expect(oneShot.transport.padPlaybackMode).toBe('oneshot')
  })

  it('hydrates older saved sessions with safe volume and Gate defaults', () => {
    const state = createInitialState(1)
    const oldTransport = { ...state.transport }
    delete (oldTransport as Partial<typeof oldTransport>).masterVolume
    delete (oldTransport as Partial<typeof oldTransport>).padPlaybackMode
    const loaded = reducer(state, {
      type: 'LOAD_PROJECT',
      state: { ...state, transport: oldTransport as typeof state.transport },
    })

    expect(loaded.transport.masterVolume).toBe(100)
    expect(loaded.transport.padPlaybackMode).toBe('gate')
  })

})
