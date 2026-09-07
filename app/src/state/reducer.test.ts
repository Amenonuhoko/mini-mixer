import { describe, expect, it } from 'vitest'
import { BPM_MAX, BPM_MIN, EFFECT_MAX, EFFECT_MIN, MIN_TRIM_GAP } from './constants'
import { createInitialState } from './defaults'
import { reducer } from './reducer'
import type { Sample } from './types'

function makeSample(id: string): Sample {
  return {
    id,
    label: id,
    buffer: {} as AudioBuffer,
    recordedAt: 0,
    peaks: [],
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

  it('toggles the metronome', () => {
    const state = createInitialState(1)
    expect(state.transport.metronomeEnabled).toBe(false)
    const on = reducer(state, { type: 'SET_METRONOME_ENABLED', enabled: true })
    expect(on.transport.metronomeEnabled).toBe(true)
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
})
