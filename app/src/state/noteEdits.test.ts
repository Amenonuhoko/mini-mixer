import { describe, expect, it } from 'vitest'
import { createInitialState } from './defaults'
import { reducer } from './reducer'
import type { AppState, Sample } from './types'

/** A pattern with lit steps at 0, 1 and 8 of the first pad, and 2 of the second. */
function lit(): { state: AppState; patternId: string; a: string; b: string } {
  let state = createInitialState()
  const patternId = state.activePatternId
  const [a, b] = [state.pads[0]!.id, state.pads[1]!.id]
  for (const [padId, stepIndex] of [[a, 0], [a, 1], [a, 8], [b, 2]] as const) {
    state = reducer(state, { type: 'TOGGLE_STEP', patternId, padId, stepIndex, sampleId: 'kick' })
  }
  return { state, patternId, a, b }
}
const editsOf = (state: AppState, patternId: string) => state.patterns.find((pattern) => pattern.id === patternId)!.noteEdits

describe('editing notes', () => {
  it('sets an edit on the lit steps picked, merges further changes, and skips steps that are not lit', () => {
    const { state: start, patternId, a, b } = lit()
    let state = reducer(start, {
      type: 'SET_NOTE_EDITS', patternId, edit: { fadeInSteps: 2, lengthSteps: 4 },
      notes: [{ padId: a, stepIndex: 0 }, { padId: a, stepIndex: 5 }, { padId: b, stepIndex: 2 }],
    })
    expect(editsOf(state, patternId)).toEqual({ [a]: { '0': { fadeInSteps: 2, lengthSteps: 4 } }, [b]: { '2': { fadeInSteps: 2, lengthSteps: 4 } } })
    state = reducer(state, { type: 'SET_NOTE_EDITS', patternId, edit: { stretch: true }, notes: [{ padId: a, stepIndex: 0 }] })
    expect(editsOf(state, patternId)![a]!['0']).toEqual({ fadeInSteps: 2, lengthSteps: 4, stretch: true })
    expect(editsOf(state, patternId)![b]!['2']).toEqual({ fadeInSteps: 2, lengthSteps: 4 })
  })

  it('removes an edit when its last setting is set to 0, and the pattern keeps no empty record', () => {
    const { state: start, patternId, a } = lit()
    const notes = [{ padId: a, stepIndex: 1 }]
    let state = reducer(start, { type: 'SET_NOTE_EDITS', patternId, edit: { fadeOutSteps: 3 }, notes })
    state = reducer(state, { type: 'SET_NOTE_EDITS', patternId, edit: { fadeOutSteps: 0 }, notes })
    expect(state.patterns.find((pattern) => pattern.id === patternId)).not.toHaveProperty('noteEdits')
  })

  it('resets the picked notes only', () => {
    const { state: start, patternId, a, b } = lit()
    let state = reducer(start, { type: 'SET_NOTE_EDITS', patternId, edit: { lengthSteps: 2 }, notes: [{ padId: a, stepIndex: 0 }, { padId: b, stepIndex: 2 }] })
    state = reducer(state, { type: 'CLEAR_NOTE_EDITS', patternId, notes: [{ padId: a, stepIndex: 0 }] })
    expect(editsOf(state, patternId)).toEqual({ [b]: { '2': { lengthSteps: 2 } } })
  })
})

describe('note edits follow their steps', () => {
  const withEdit = () => {
    const made = lit()
    const state = reducer(made.state, { type: 'SET_NOTE_EDITS', patternId: made.patternId, edit: { lengthSteps: 3 }, notes: [{ padId: made.a, stepIndex: 8 }, { padId: made.a, stepIndex: 1 }] })
    return { ...made, state }
  }

  it('drops an edit when its step is switched off, and does not bring it back when the step is switched on again', () => {
    const { state: start, patternId, a } = withEdit()
    let state = reducer(start, { type: 'TOGGLE_STEP', patternId, padId: a, stepIndex: 8, sampleId: 'kick' })
    expect(editsOf(state, patternId)![a]).toEqual({ '1': { lengthSteps: 3 } })
    state = reducer(state, { type: 'TOGGLE_STEP', patternId, padId: a, stepIndex: 8, sampleId: 'kick' })
    expect(editsOf(state, patternId)![a]).toEqual({ '1': { lengthSteps: 3 } })
  })

  it('drops the edits of steps a shorter pattern no longer has, and of a cleared pattern', () => {
    const { state: start, patternId, a } = withEdit()
    let state = reducer(start, { type: 'REMOVE_PATTERN_STEPS', patternId })
    state = reducer(state, { type: 'REMOVE_PATTERN_STEPS', patternId })
    expect(editsOf(state, patternId)![a]).toEqual({ '1': { lengthSteps: 3 } })
    expect(editsOf(reducer(start, { type: 'CLEAR_PATTERN', patternId }), patternId)).toBeUndefined()
  })

  it('drops a row\'s edits when a fill rewrites the row fresh', () => {
    const { state: start, patternId, a } = withEdit()
    // The steps 1 and 8 stay lit with the same sound, so only the fill itself can be what drops their edits.
    const withKick = { ...start, samples: { ...start.samples, kick: { id: 'kick' } as Sample } }
    const state = reducer(withKick, { type: 'SET_ROW_STEPS', patternId, padId: a, steps: [0, 1, 4, 8], sampleId: 'kick' })
    expect(state.patterns.find((pattern) => pattern.id === patternId)!.steps[a]![8]).toBe('kick')
    expect(editsOf(state, patternId)).toBeUndefined()
  })

  it('goes with a copy of the pattern, and a copy over another pattern replaces the edits it had', () => {
    const { state: start, patternId, a } = withEdit()
    let state = reducer(start, { type: 'ADD_PATTERN', copyFromId: patternId })
    const copyId = state.activePatternId
    expect(editsOf(state, copyId)).toEqual(editsOf(start, patternId))
    expect(editsOf(state, copyId)).not.toBe(editsOf(start, patternId))
    state = reducer(state, { type: 'SET_NOTE_EDITS', patternId: copyId, edit: { lengthSteps: 9 }, notes: [{ padId: a, stepIndex: 0 }] })
    expect(editsOf(state, patternId)![a]!['0']).toBeUndefined()
    // Copying the original over it brings the original's edits, and drops the copy's own.
    state = reducer(state, { type: 'COPY_PATTERN_FROM', patternId: copyId, fromId: patternId })
    expect(editsOf(state, copyId)).toEqual(editsOf(start, patternId))
    const blank = reducer(state, { type: 'ADD_PATTERN' })
    state = reducer(blank, { type: 'COPY_PATTERN_FROM', patternId: copyId, fromId: blank.activePatternId })
    expect(editsOf(state, copyId)).toBeUndefined()
  })

  it('repeats bar 1\'s edits onto every bar with its steps', () => {
    let { state, patternId, a } = withEdit()
    for (let i = 0; i < 4; i++) state = reducer(state, { type: 'ADD_PATTERN_STEPS', patternId })
    state = reducer(state, { type: 'REPEAT_FIRST_BAR', patternId })
    expect(state.patterns.find((pattern) => pattern.id === patternId)!.stepCount).toBe(32)
    expect(Object.keys(editsOf(state, patternId)![a]!).sort()).toEqual(['1', '17', '24', '8'])
    expect(editsOf(state, patternId)![a]!['17']).toEqual({ lengthSteps: 3 })
  })

  it('does not rebuild the patterns for an action that touches none', () => {
    const { state } = withEdit()
    const next = reducer(state, { type: 'SET_BPM', bpm: state.transport.bpm + 1 })
    expect(next.patterns).toBe(state.patterns)
  })
})
