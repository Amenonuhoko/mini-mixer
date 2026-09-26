import { describe, expect, it } from 'vitest'
import { BPM_MAX, BPM_MIN, EFFECT_MAX, EFFECT_MIN, MIN_TRIM_GAP } from './constants'
import { createInitialState } from './defaults'
import { reducer } from './reducer'
import { getBank, visibleBankPads } from './banks'
import { patternPitchCents } from '../engine/songTimeline'
import type { AppState, BankBuild, BankKind, PadMusic, Sample } from './types'

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

function makeNote(id: string): Sample {
  return { ...makeSample(id), kind: 'note' }
}

/** A fake build: one generated note sample per midi, named `${prefix}_${midi}`. */
function makeBuild(state: AppState, kind: BankKind, prefix: string, midis: number[], soundName = 'Piano'): BankBuild {
  const samples = midis.map((midi) => makeNote(`${prefix}_${midi}`))
  return {
    bankId: getBank(state, kind).id,
    sound: { type: 'preset', name: soundName },
    columns: 4,
    pads: midis.map((midi, i) => ({ sampleId: samples[i]!.id, music: { kind: 'note', midis: [midi] } satisfies PadMusic })),
    samples,
    noteSampleIds: Object.fromEntries(midis.map((midi, i) => [String(midi), samples[i]!.id])),
  }
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

  it('adds a sample straight to the next visible pad, creating its pattern row when needed', () => {
    const state = createInitialState(1)
    const sample = makeSample('bounce')

    const next = reducer(state, { type: 'ADD_SAMPLE_TO_NEW_PAD', sample })

    expect(getBank(next, 'drums').visibleCount).toBe(2)
    expect(next.pads[1]!.sampleId).toBe(sample.id)
    expect(next.samples[sample.id]).toBe(sample)
    expect(next.patterns[0]!.steps[next.pads[1]!.id]).toHaveLength(16)
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

    const on = reducer(state, { type: 'TOGGLE_STEP', patternId, padId, stepIndex: 3, sampleId: 'piano_1' })
    expect(on.patterns[0]!.steps[padId]![3]).toBe('piano_1')

    const off = reducer(on, { type: 'TOGGLE_STEP', patternId, padId, stepIndex: 3, sampleId: 'piano_1' })
    expect(off.patterns[0]!.steps[padId]![3]).toBeNull()
  })

  it('keeps a programmed step on its original sound when the pad is reassigned', () => {
    const state = createInitialState(1)
    const patternId = state.activePatternId
    const padId = state.pads[0]!.id
    const piano = makeSample('piano_1')
    const guitar = makeSample('guitar_1')

    let next = reducer(state, { type: 'ADD_SAMPLE', sample: piano })
    next = reducer(next, { type: 'ADD_SAMPLE', sample: guitar })
    next = reducer(next, { type: 'ASSIGN_SAMPLE_TO_PAD', padId, sampleId: piano.id })
    next = reducer(next, { type: 'TOGGLE_STEP', patternId, padId, stepIndex: 0, sampleId: piano.id })
    next = reducer(next, { type: 'ASSIGN_SAMPLE_TO_PAD', padId, sampleId: guitar.id })
    next = reducer(next, { type: 'TOGGLE_STEP', patternId, padId, stepIndex: 1, sampleId: guitar.id })

    expect(next.patterns[0]!.steps[padId]![0]).toBe(piano.id)
    expect(next.patterns[0]!.steps[padId]![1]).toBe(guitar.id)
  })

  it('removes the final four sequencer steps and their placements', () => {
    const state = createInitialState(1)
    const patternId = state.activePatternId
    const padId = state.pads[0]!.id
    let next = reducer(state, { type: 'ADD_PATTERN_STEPS', patternId })
    next = reducer(next, {
      type: 'TOGGLE_STEP',
      patternId,
      padId,
      stepIndex: 19,
      sampleId: 'guitar_1',
    })

    const shortened = reducer(next, { type: 'REMOVE_PATTERN_STEPS', patternId })

    expect(shortened.patterns[0]!.stepCount).toBe(16)
    expect(shortened.patterns[0]!.steps[padId]).toHaveLength(16)
    expect(shortened.patterns[0]!.steps[padId]![15]).toBeNull()
  })

  it('captures a visual-only trace without changing the live sequence', () => {
    const state = createInitialState(1)
    const patternId = state.activePatternId
    const padId = state.pads[0]!.id
    const programmed = reducer(state, {
      type: 'TOGGLE_STEP',
      patternId,
      padId,
      stepIndex: 2,
      sampleId: 'piano_1',
    })

    const traced = reducer(programmed, { type: 'CAPTURE_PATTERN_TRACE', patternId })
    const cleared = reducer(traced, { type: 'CLEAR_PATTERN', patternId })

    expect(traced.patterns[0]!.traceSteps?.[padId]![2]).toBe('piano_1')
    expect(cleared.patterns[0]!.steps[padId]![2]).toBeNull()
    expect(cleared.patterns[0]!.traceSteps?.[padId]![2]).toBe('piano_1')
  })

  it('adds four sequencer cells to the right without changing existing steps', () => {
    const state = createInitialState(1)
    const patternId = state.activePatternId
    const padId = state.pads[0]!.id
    const withStep = reducer(state, {
      type: 'TOGGLE_STEP',
      patternId,
      padId,
      stepIndex: 0,
      sampleId: 'piano_1',
    })

    const extended = reducer(withStep, { type: 'ADD_PATTERN_STEPS', patternId })

    expect(extended.patterns[0]!.stepCount).toBe(20)
    expect(extended.patterns[0]!.steps[padId]).toHaveLength(20)
    expect(extended.patterns[0]!.steps[padId]![0]).toBe('piano_1')
    expect(extended.patterns[0]!.steps[padId]!.slice(16)).toEqual([null, null, null, null])
  })

  it('clears every step in a pattern across every pad it tracks', () => {
    const state = createInitialState(2)
    const patternId = state.activePatternId
    const padA = state.pads[0]!.id
    const padB = state.pads[1]!.id

    let next = reducer(state, { type: 'TOGGLE_STEP', patternId, padId: padA, stepIndex: 0, sampleId: 'piano_1' })
    next = reducer(next, { type: 'TOGGLE_STEP', patternId, padId: padA, stepIndex: 5, sampleId: 'piano_1' })
    next = reducer(next, { type: 'TOGGLE_STEP', patternId, padId: padB, stepIndex: 2, sampleId: 'guitar_1' })

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

  it('Loop Mode and Mixer Mode are mutually exclusive', () => {
    const state = createInitialState(1)
    const loopOn = reducer(state, { type: 'SET_PAD_LOOP_MODE_ENABLED', enabled: true })
    const mixerOn = reducer(loopOn, { type: 'SET_PAD_MIXER_MODE_ENABLED', enabled: true })
    expect(mixerOn.transport.padMixerModeEnabled).toBe(true)
    expect(mixerOn.transport.padLoopModeEnabled).toBe(false)

    const backToLoop = reducer(mixerOn, { type: 'SET_PAD_LOOP_MODE_ENABLED', enabled: true })
    expect(backToLoop.transport.padLoopModeEnabled).toBe(true)
    expect(backToLoop.transport.padMixerModeEnabled).toBe(false)
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

  it('toggles playthrough recording independently of loop mode', () => {
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

  it('a fresh project has all four banks, Drums active and holding the pads, in the Bright mood', () => {
    const state = createInitialState(3)
    expect(state.banks.map((bank) => bank.kind)).toEqual(['drums', 'bass', 'chords', 'melody'])
    expect(state.activeBankId).toBe(getBank(state, 'drums').id)
    expect(getBank(state, 'drums').padIds).toEqual(state.pads.map((pad) => pad.id))
    expect(getBank(state, 'chords').padIds).toEqual([])
    expect(state.mood).toBe('bright')
  })

  it('switches the active bank, ignoring unknown ids', () => {
    const state = createInitialState(1)
    const bass = getBank(state, 'bass')
    expect(reducer(state, { type: 'SET_ACTIVE_BANK', bankId: bass.id }).activeBankId).toBe(bass.id)
    expect(reducer(state, { type: 'SET_ACTIVE_BANK', bankId: 'nope' })).toBe(state)
  })

  it('building a sound into an empty bank creates its pads, samples and empty pattern rows', () => {
    const state = createInitialState(2)
    const next = reducer(state, { type: 'APPLY_BANK_BUILDS', builds: [makeBuild(state, 'bass', 'c', [36, 38, 40])], remap: 'index' })

    const bass = getBank(next, 'bass')
    expect(bass.visibleCount).toBe(3)
    expect(bass.sound).toEqual({ type: 'preset', name: 'Piano' })
    const pads = visibleBankPads(next, bass)
    expect(pads.map((pad) => pad.sampleId)).toEqual(['c_36', 'c_38', 'c_40'])
    expect(pads[1]!.music).toEqual({ kind: 'note', midis: [38] })
    expect(next.samples.c_38).toBeDefined()
    expect(next.patterns[0]!.steps[pads[0]!.id]).toHaveLength(16)
    // Drums untouched.
    expect(visibleBankPads(next, getBank(next, 'drums'))).toHaveLength(2)
  })

  it('a key change keeps programmed steps on the same pads and cleans up the old key’s sounds', () => {
    let state = createInitialState(1)
    state = reducer(state, { type: 'APPLY_BANK_BUILDS', builds: [makeBuild(state, 'melody', 'c', [60, 62, 64])], remap: 'index' })
    const melodyPads = visibleBankPads(state, getBank(state, 'melody'))
    state = reducer(state, { type: 'TOGGLE_STEP', patternId: state.activePatternId, padId: melodyPads[1]!.id, stepIndex: 0, sampleId: 'c_62' })
    expect(state.patterns[0]!.steps[melodyPads[1]!.id]![0]).toBe('c_62')

    const dMinor = { tonic: 2, scale: 'minor' as const, chordColor: 'triad' as const }
    const next = reducer(state, {
      type: 'APPLY_BANK_BUILDS',
      builds: [makeBuild(state, 'melody', 'd', [62, 64, 65])],
      remap: 'index',
      key: dMinor,
      mood: null,
    })

    expect(next.key).toEqual(dMinor)
    expect(next.mood).toBeNull()
    expect(next.patterns[0]!.steps[melodyPads[1]!.id]![0]).toBe('d_64')
    expect(next.samples.c_62).toBeUndefined()
    expect(next.sampleOrder.some((id) => id.startsWith('c_'))).toBe(false)
  })

  it('recorded single notes from the note pool follow a key change too', () => {
    let state = createInitialState(1)
    const build = { ...makeBuild(state, 'chords', 'c', [60]), noteSampleIds: { '60': 'c_60', '64': 'c_pool_64', '67': 'c_pool_67' } }
    build.samples = [...build.samples, makeNote('c_pool_64'), makeNote('c_pool_67')]
    state = reducer(state, { type: 'APPLY_BANK_BUILDS', builds: [build], remap: 'index' })
    const padId = visibleBankPads(state, getBank(state, 'chords'))[0]!.id
    state = reducer(state, { type: 'SET_STEP_SAMPLE', patternId: state.activePatternId, padId, stepIndex: 2, sampleId: 'c_pool_64' })

    // Up a whole step to D: E (64) should become F♯ (66).
    const next = { ...makeBuild(state, 'chords', 'd', [62]), noteSampleIds: { '62': 'd_62', '66': 'd_pool_66', '69': 'd_pool_69' } }
    next.samples = [...next.samples, makeNote('d_pool_66'), makeNote('d_pool_69')]
    const moved = reducer(state, {
      type: 'APPLY_BANK_BUILDS',
      builds: [next],
      remap: 'index',
      key: { tonic: 2, scale: 'major', chordColor: 'triad' },
      mood: null,
    })
    expect(moved.patterns[0]!.steps[padId]![2]).toBe('d_pool_66')
    expect(moved.samples.c_pool_64).toBeUndefined()
  })

  it('a layout change moves each programmed note to the pad with the nearest pitch', () => {
    let state = createInitialState(1)
    state = reducer(state, { type: 'APPLY_BANK_BUILDS', builds: [makeBuild(state, 'melody', 'a', [60, 62, 64])], remap: 'index' })
    const oldPads = visibleBankPads(state, getBank(state, 'melody'))
    state = reducer(state, { type: 'TOGGLE_STEP', patternId: state.activePatternId, padId: oldPads[2]!.id, stepIndex: 3, sampleId: 'a_64' })

    // Chromatic: 60, 61, 62, 63, 64 — E (64) now lives on the fifth pad.
    const next = reducer(state, {
      type: 'APPLY_BANK_BUILDS',
      builds: [makeBuild(state, 'melody', 'b', [60, 61, 62, 63, 64])],
      remap: 'pitch',
      padLayout: 'free',
    })

    const newPads = visibleBankPads(next, getBank(next, 'melody'))
    expect(next.padLayout).toBe('free')
    expect(next.patterns[0]!.steps[newPads[4]!.id]![3]).toBe('b_64')
    expect(next.patterns[0]!.steps[oldPads[2]!.id]![3]).toBeNull()
  })

  it('a smaller layout empties the slots it no longer uses', () => {
    let state = createInitialState(1)
    state = reducer(state, { type: 'APPLY_BANK_BUILDS', builds: [makeBuild(state, 'chords', 'a', [60, 62, 64, 65])], remap: 'index' })
    const next = reducer(state, { type: 'APPLY_BANK_BUILDS', builds: [makeBuild(state, 'chords', 'b', [60, 62])], remap: 'index' })
    const chords = getBank(next, 'chords')
    expect(chords.visibleCount).toBe(2)
    expect(next.pads.find((pad) => pad.id === chords.padIds[3])!.sampleId).toBeNull()
    expect(next.samples.a_65).toBeUndefined()
  })

  it('remembers a bank’s whole-bank character per sound and brings it back', () => {
    let state = createInitialState(1)
    state = reducer(state, { type: 'APPLY_BANK_BUILDS', builds: [makeBuild(state, 'bass', 'p', [36], 'Piano')], remap: 'index' })
    state = reducer(state, { type: 'SET_ACTIVE_BANK', bankId: getBank(state, 'bass').id })
    state = reducer(state, { type: 'APPLY_EFFECT_PRESET_TO_ALL_PADS', filter: 40, grit: 0, echo: 0, reverb: 20 })
    expect(state.fxBySound['preset:Piano']).toEqual({ filter: 40, grit: 0, echo: 0, reverb: 20 })

    const filterOf = (s: AppState) => visibleBankPads(s, getBank(s, 'bass'))[0]!.effects.find((e) => e.id === 'filter')!.value
    state = reducer(state, { type: 'APPLY_BANK_BUILDS', builds: [makeBuild(state, 'bass', 'o', [36], 'Organ')], remap: 'index' })
    expect(filterOf(state)).toBe(0)
    state = reducer(state, { type: 'APPLY_BANK_BUILDS', builds: [makeBuild(state, 'bass', 'q', [36], 'Piano')], remap: 'index' })
    expect(filterOf(state)).toBe(40)
  })

  it('writes a layer into one bank’s rows without touching the others', () => {
    let state = createInitialState(1)
    const drumPadId = state.pads[0]!.id
    state = reducer(state, { type: 'ADD_SAMPLE', sample: makeSample('kick') })
    state = reducer(state, { type: 'ASSIGN_SAMPLE_TO_PAD', padId: drumPadId, sampleId: 'kick' })
    state = reducer(state, { type: 'TOGGLE_STEP', patternId: state.activePatternId, padId: drumPadId, stepIndex: 0, sampleId: 'kick' })
    state = reducer(state, { type: 'APPLY_BANK_BUILDS', builds: [makeBuild(state, 'bass', 'b', [36, 38])], remap: 'index' })
    const bassPads = visibleBankPads(state, getBank(state, 'bass'))

    const next = reducer(state, {
      type: 'WRITE_BANK_PATTERN',
      bankId: getBank(state, 'bass').id,
      patternId: state.activePatternId,
      stepsByPadIndex: { 0: [0, 8], 1: [20] },
      minStepCount: 32,
    })

    const steps = next.patterns[0]!.steps
    expect(next.patterns[0]!.stepCount).toBe(32)
    expect(steps[drumPadId]![0]).toBe('kick')
    expect(steps[drumPadId]).toHaveLength(32)
    expect(steps[bassPads[0]!.id]!.flatMap((cell, i) => (cell ? [i] : []))).toEqual([0, 8])
    expect(steps[bassPads[1]!.id]![20]).toBe('b_38')
  })

  it('deletes one bank’s steps from one pattern while keeping other banks and patterns', () => {
    let state = createInitialState(1)
    const patternId = state.activePatternId
    const drumPadId = state.pads[0]!.id
    state = reducer(state, { type: 'TOGGLE_STEP', patternId, padId: drumPadId, stepIndex: 0, sampleId: 'kick' })
    state = reducer(state, { type: 'APPLY_BANK_BUILDS', builds: [makeBuild(state, 'chords', 'c', [60])], remap: 'index' })
    const chords = getBank(state, 'chords')
    const chordPadId = chords.padIds[0]!
    state = reducer(state, {
      type: 'TOGGLE_STEP', patternId, padId: chordPadId, stepIndex: 4, sampleId: 'chord',
    })
    state = reducer(state, { type: 'ADD_PATTERN', copyFromId: patternId })
    const copyId = state.activePatternId
    state = reducer(state, { type: 'CLEAR_BANK_PATTERN', patternId, bankId: chords.id })
    expect(state.patterns.find((item) => item.id === patternId)!.steps[chordPadId]!.every((cell) => cell === null)).toBe(true)
    expect(state.patterns.find((item) => item.id === patternId)!.steps[drumPadId]![0]).toBe('kick')
    expect(state.patterns.find((item) => item.id === copyId)!.steps[chordPadId]![4]).toBe('chord')
  })

  it('whole-bank effects only touch the active bank', () => {
    let state = createInitialState(1)
    state = reducer(state, { type: 'APPLY_BANK_BUILDS', builds: [makeBuild(state, 'bass', 'b', [36])], remap: 'index' })
    const next = reducer(state, { type: 'SET_ALL_PADS_EFFECTS_BYPASSED', bypassed: true })
    expect(visibleBankPads(next, getBank(next, 'drums'))[0]!.effectsBypassed).toBe(true)
    expect(visibleBankPads(next, getBank(next, 'bass'))[0]!.effectsBypassed).toBe(false)
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

    expect(getBank(next, 'drums').visibleCount).toBe(2)
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
    expect(next.patterns[0]!.steps[newPadId]!.every((step) => step === null)).toBe(true)
  })

  it('CLEAR_ALL resets to a fresh default state at the same Drums pad count', () => {
    const state = createInitialState(3)
    const sample = makeSample('temp')
    const dirtied = reducer(state, { type: 'ADD_SAMPLE', sample })

    const cleared = reducer(dirtied, { type: 'CLEAR_ALL' })

    expect(cleared.samples).toEqual({})
    expect(cleared.sampleOrder).toEqual([])
    expect(getBank(cleared, 'drums').visibleCount).toBe(3)
    expect(cleared.pads.every((pad) => pad.sampleId === null)).toBe(true)
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

  it('loading a saved sequence restores real, playable steps and replaces the pattern', () => {
    const state = createInitialState(2)
    const patternId = state.activePatternId
    const [padA, padB] = state.pads
    const kept = makeSample('kept')
    let next = reducer(state, { type: 'ADD_SAMPLE', sample: kept })
    // Give the active pattern some pre-existing content the load should replace.
    next = reducer(next, {
      type: 'TOGGLE_STEP',
      patternId,
      padId: padA!.id,
      stepIndex: 3,
      sampleId: 'stale',
    })

    const loaded = reducer(next, {
      type: 'LOAD_SEQUENCE_TRACE',
      patternId,
      trace: {
        stepCount: 4,
        rows: [
          [kept.id, null, 'deleted_sample', null],
          [null, null, null, null],
        ],
      },
      markerSampleId: 'bounce_1',
    })

    const pattern = loaded.patterns.find((p) => p.id === patternId)!
    expect(pattern.stepCount).toBe(16)
    expect(pattern.steps[padA!.id]!.slice(0, 4)).toEqual([kept.id, null, null, null])
    expect(pattern.steps[padB!.id]!.slice(0, 4)).toEqual([null, null, null, null])
    // The stale pre-existing step is gone — a load replaces the pattern, it doesn't merge.
    expect(pattern.steps[padA!.id]![3]).toBeNull()
    // The deleted sample can't play, so it surfaces only as a ghost trace marker.
    expect(pattern.traceSteps?.[padA!.id]!.slice(0, 4)).toEqual([null, null, 'bounce_1', null])
    expect(pattern.traceSource).toBe('reference')
  })

  it('loading a sequence with every sample still present skips the ghost trace entirely', () => {
    const state = createInitialState(1)
    const patternId = state.activePatternId
    const padId = state.pads[0]!.id
    const kept = makeSample('kept')
    const next = reducer(state, { type: 'ADD_SAMPLE', sample: kept })

    const loaded = reducer(next, {
      type: 'LOAD_SEQUENCE_TRACE',
      patternId,
      trace: { stepCount: 4, rows: [[kept.id, null, null, null]] },
      markerSampleId: 'bounce_1',
    })

    const pattern = loaded.patterns.find((p) => p.id === patternId)!
    expect(pattern.steps[padId]!.slice(0, 4)).toEqual([kept.id, null, null, null])
    expect(pattern.traceSteps).toBeNull()
    expect(pattern.traceSource).toBeNull()
  })


  it('clears one step, fills a row exactly, and repeats bar one across the pattern', () => {
    let state = createInitialState(2)
    const [kick, hat] = state.pads
    const patternId = state.activePatternId
    state = reducer(state, { type: 'ADD_SAMPLE', sample: makeSample('kick') })
    state = reducer(state, { type: 'ADD_SAMPLE', sample: makeSample('hat') })
    state = reducer(state, { type: 'TOGGLE_STEP', patternId, padId: kick!.id, stepIndex: 3, sampleId: 'kick' })
    state = reducer(state, { type: 'CLEAR_STEP', patternId, padId: kick!.id, stepIndex: 3 })
    expect(state.patterns[0]!.steps[kick!.id]![3]).toBeNull()

    state = reducer(state, { type: 'SET_ROW_STEPS', patternId, padId: hat!.id, steps: [0, 2, 4, 6], sampleId: 'hat' })
    expect(state.patterns[0]!.steps[hat!.id]!.flatMap((cell, i) => (cell ? [i] : []))).toEqual([0, 2, 4, 6])
    state = reducer(state, { type: 'SET_ROW_STEPS', patternId, padId: hat!.id, steps: [1], sampleId: 'hat' })
    expect(state.patterns[0]!.steps[hat!.id]!.flatMap((cell, i) => (cell ? [i] : []))).toEqual([1])

    state = reducer(state, { type: 'ADD_PATTERN_STEPS', patternId })
    state = reducer(state, { type: 'ADD_PATTERN_STEPS', patternId })
    state = reducer(state, { type: 'ADD_PATTERN_STEPS', patternId })
    state = reducer(state, { type: 'ADD_PATTERN_STEPS', patternId })
    state = reducer(state, { type: 'REPEAT_FIRST_BAR', patternId })
    expect(state.patterns[0]!.stepCount).toBe(32)
    expect(state.patterns[0]!.steps[hat!.id]!.flatMap((cell, i) => (cell ? [i] : []))).toEqual([1, 17])
  })
})


it('keeps generator settings with the pattern when switching and copying song parts', () => {
  let state = createInitialState()
  const first = state.activePatternId
  const groove = { seed: 42, bars: 2, progression: [0, 4], layers: { drums: { styleId: 'house', take: 3, intensity: .9 } } }
  state = reducer(state, { type: 'SET_GROOVE', groove })
  state = reducer(state, { type: 'ADD_PATTERN' })
  expect(state.groove).toBeNull()
  state = reducer(state, { type: 'SET_ACTIVE_PATTERN', patternId: first })
  expect(state.groove).toEqual(groove)
  state = reducer(state, { type: 'ADD_PATTERN', copyFromId: first })
  expect(state.groove).toEqual(groove)
})


describe('independent song sections', () => {
  it('copies the shared pattern while keeping the other sections linked', () => {
    let state = createInitialState()
    state = reducer(state, { type: 'APPLY_SONG_TEMPLATE', sections: ['Verse', 'Chorus', 'Verse'] })
    const first = state.songSections[0]!
    const original = state.patterns.find((pattern) => pattern.id === first.patternId)!
    const next = reducer(state, { type: 'MAKE_SECTION_UNIQUE', sectionId: first.id })
    expect(next.songSections[0]!.patternId).not.toBe(original.id)
    expect(next.songSections[2]!.patternId).toBe(original.id)
    const copy = next.patterns.find((pattern) => pattern.id === next.songSections[0]!.patternId)!
    expect(copy.steps).toEqual(original.steps)
    expect(copy.steps).not.toBe(original.steps)
  })
})


describe('bank volume', () => {
  it('sets one bank\'s volume, clamped, leaving its pads\' own levels alone', () => {
    let state = createInitialState()
    const drums = getBank(state, 'drums')
    const levels = state.pads.map((pad) => pad.mixLevel)
    state = reducer(state, { type: 'SET_BANK_VOLUME', bankId: drums.id, level: 42.4 })
    expect(getBank(state, 'drums').volume).toBe(42)
    expect(getBank(state, 'bass').volume).toBeUndefined()
    expect(state.pads.map((pad) => pad.mixLevel)).toEqual(levels)
    state = reducer(state, { type: 'SET_BANK_VOLUME', bankId: drums.id, level: 140 })
    expect(getBank(state, 'drums').volume).toBe(100)
  })
})

describe('copy a pattern from another', () => {
  it('replaces the steps and length with an independent copy, keeping the name and song links', () => {
    let state = createInitialState()
    state = reducer(state, { type: 'APPLY_SONG_TEMPLATE', sections: ['Intro', 'Verse'] })
    const [intro, verse] = state.songSections
    const padId = state.pads[0]!.id
    state = reducer(state, { type: 'TOGGLE_STEP', patternId: intro!.patternId, padId, stepIndex: 2, sampleId: 'kick' })
    state = reducer(state, { type: 'ADD_PATTERN_STEPS', patternId: intro!.patternId })
    state = reducer(state, { type: 'TOGGLE_STEP', patternId: verse!.patternId, padId, stepIndex: 5, sampleId: 'kick' })
    state = reducer(state, { type: 'COPY_PATTERN_FROM', patternId: verse!.patternId, fromId: intro!.patternId })
    const copied = state.patterns.find((pattern) => pattern.id === verse!.patternId)!
    const source = state.patterns.find((pattern) => pattern.id === intro!.patternId)!
    expect(copied.name).not.toBe(source.name)
    expect(copied.stepCount).toBe(source.stepCount)
    expect(copied.steps[padId]).toEqual(source.steps[padId])
    expect(copied.steps[padId]![5]).toBeNull()
    expect(state.songSections[1]!.patternId).toBe(verse!.patternId)
    // Independent: editing the copy leaves the source alone.
    state = reducer(state, { type: 'TOGGLE_STEP', patternId: verse!.patternId, padId, stepIndex: 7, sampleId: 'kick' })
    expect(state.patterns.find((pattern) => pattern.id === intro!.patternId)!.steps[padId]![7]).toBeNull()
  })
})

describe('pattern pitch', () => {
  it('belongs to one pattern: pitching the Verse leaves the Chorus alone', () => {
    let state = createInitialState()
    state = reducer(state, { type: 'ADD_PATTERN' })
    const [verse, chorus] = state.patterns
    state = reducer(state, { type: 'SET_PATTERN_PITCH', patternId: verse!.id, bank: 'melody', semitones: 7 })
    expect(state.patterns.find((pattern) => pattern.id === verse!.id)!.pitch).toEqual({ melody: 7 })
    expect(state.patterns.find((pattern) => pattern.id === chorus!.id)!.pitch).toBeUndefined()
    expect(patternPitchCents(state.patterns.find((pattern) => pattern.id === verse!.id)!, 'melody')).toBe(700)
    expect(patternPitchCents(state.patterns.find((pattern) => pattern.id === verse!.id)!, 'bass')).toBe(0)
  })

  it('clamps to an octave and drops back to nothing at 0', () => {
    let state = createInitialState()
    const id = state.patterns[0]!.id
    state = reducer(state, { type: 'SET_PATTERN_PITCH', patternId: id, bank: 'bass', semitones: 30 })
    expect(state.patterns[0]!.pitch).toEqual({ bass: 12 })
    state = reducer(state, { type: 'SET_PATTERN_PITCH', patternId: id, bank: 'bass', semitones: 0 })
    expect(state.patterns[0]!.pitch).toBeUndefined()
  })

  it('travels with copies: duplicating a section keeps its pitch on the new pattern', () => {
    let state = createInitialState()
    const id = state.patterns[0]!.id
    state = reducer(state, { type: 'SET_PATTERN_PITCH', patternId: id, bank: 'melody', semitones: -5 })
    state = reducer(state, { type: 'DUPLICATE_SONG_SECTION', sectionId: state.songSections[0]!.id })
    const copy = state.patterns.find((pattern) => pattern.id === state.songSections[1]!.patternId)!
    expect(copy.id).not.toBe(id)
    expect(copy.pitch).toEqual({ melody: -5 })
  })
})
