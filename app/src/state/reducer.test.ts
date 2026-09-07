import { describe, expect, it } from 'vitest'
import { BPM_MAX, BPM_MIN } from './constants'
import { createInitialState } from './defaults'
import { reducer } from './reducer'
import type { Sample } from './types'

function makeSample(id: string): Sample {
  return {
    id,
    label: id,
    buffer: {} as AudioBuffer,
    recordedAt: 0,
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
    expect(cleared.visiblePadCount).toBe(3)
    expect(cleared.pads.every((pad) => pad.sampleId === null)).toBe(true)
  })
})
