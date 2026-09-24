import { describe, expect, it } from 'vitest'
import { createInitialState } from '../state/defaults'
import { reducer } from '../state/reducer'
import { buildSongTimeline, songStepAt } from './songTimeline'

describe('song arrangement', () => {
  it('resolves sections, repeats, and patterns with different lengths', () => {
    let state = createInitialState()
    const verseId = state.activePatternId
    state = reducer(state, { type: 'ADD_PATTERN' })
    const chorusId = state.activePatternId
    state = reducer(state, { type: 'ADD_PATTERN_STEPS', patternId: chorusId })
    const firstSectionId = state.songSections[0]!.id
    state = reducer(state, {
      type: 'UPDATE_SONG_SECTION',
      sectionId: firstSectionId,
      patternId: verseId,
      repeats: 2,
    })
    state = reducer(state, { type: 'ADD_SONG_SECTION', afterId: firstSectionId })
    const secondSectionId = state.songSections[1]!.id
    state = reducer(state, {
      type: 'UPDATE_SONG_SECTION',
      sectionId: secondSectionId,
      patternId: chorusId,
      repeats: 3,
    })

    const timeline = buildSongTimeline(state)
    expect(timeline.map(({ startStep, endStep }) => [startStep, endStep])).toEqual([
      [0, 32],
      [32, 92],
    ])
    expect(songStepAt(timeline, 31)?.patternStep).toBe(15)
    expect(songStepAt(timeline, 32)?.patternStep).toBe(0)
    expect(songStepAt(timeline, 52)?.patternStep).toBe(0)
    expect(songStepAt(timeline, 91)?.patternStep).toBe(19)
    expect(songStepAt(timeline, 92)).toBeNull()
  })

  it('keeps duplicate patterns and sections independently editable', () => {
    let state = createInitialState()
    const originalId = state.activePatternId
    const padId = state.pads[0]!.id
    state = reducer(state, {
      type: 'TOGGLE_STEP',
      patternId: originalId,
      padId,
      stepIndex: 0,
      sampleId: 'kick',
    })
    state = reducer(state, { type: 'ADD_PATTERN', copyFromId: originalId })
    const copyId = state.activePatternId
    state = reducer(state, {
      type: 'TOGGLE_STEP',
      patternId: copyId,
      padId,
      stepIndex: 0,
      sampleId: 'kick',
    })
    expect(state.patterns.find((pattern) => pattern.id === originalId)!.steps[padId]![0]).toBe(
      'kick',
    )
    expect(state.patterns.find((pattern) => pattern.id === copyId)!.steps[padId]![0]).toBeNull()

    const sectionId = state.songSections[0]!.id
    state = reducer(state, { type: 'DUPLICATE_SONG_SECTION', sectionId })
    state = reducer(state, {
      type: 'UPDATE_SONG_SECTION',
      sectionId: state.songSections[1]!.id,
      name: 'Chorus',
      repeats: 99,
    })
    expect(state.songSections.map((section) => section.name)).toEqual(['Verse', 'Chorus'])
    expect(state.songSections[1]!.repeats).toBe(32)
  })
})
