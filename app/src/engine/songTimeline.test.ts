import { describe, expect, it } from 'vitest'
import { createInitialState } from '../state/defaults'
import { reducer } from '../state/reducer'
import { buildSongTimeline, sectionBankLevel, songStepAt } from './songTimeline'

describe('song arrangement', () => {
  it('makes a verse/chorus starter with a distinct editable chorus and linked repeats', () => {
    let state = createInitialState()
    const verseId = state.activePatternId
    state = reducer(state, {
      type: 'APPLY_SONG_TEMPLATE',
      sections: ['Verse', 'Chorus', 'Verse', 'Chorus'],
    })
    const chorusId = state.songSections[1]!.patternId
    expect(state.patterns.find((pattern) => pattern.id === verseId)?.name).toBe('Verse')
    expect(state.patterns.find((pattern) => pattern.id === chorusId)?.name).toBe('Chorus')
    expect(chorusId).not.toBe(verseId)
    expect(state.songSections.map((section) => section.patternId)).toEqual([
      verseId,
      chorusId,
      verseId,
      chorusId,
    ])
    expect(state.transport.playMode).toBe('song')

    state = reducer(state, {
      type: 'AUDITION_SONG_SECTION',
      sectionId: state.songSections[1]!.id,
      scope: 'rest',
    })
    expect(state.transport.auditionSectionId).toBe(state.songSections[1]!.id)
    expect(state.transport.auditionScope).toBe('rest')
    expect(state.transport.isPlaying).toBe(true)
    state = reducer(state, { type: 'APPLY_SONG_TEMPLATE', sections: ['Intro', 'Verse', 'Chorus'] })
    expect(state.transport.auditionSectionId).toBeNull()
    expect(state.transport.isPlaying).toBe(false)
  })

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

  it('mixes each sound group per song section without changing its shared pattern', () => {
    let state = createInitialState()
    state = reducer(state, { type: 'APPLY_SONG_TEMPLATE', sections: ['Verse', 'Chorus', 'Verse'] })
    const [verse, chorus, lastVerse] = state.songSections
    state = reducer(state, { type: 'SET_SONG_SECTION_BANK_VOLUME', sectionId: verse!.id, bank: 'drums', level: 35 })
    state = reducer(state, { type: 'SET_SONG_SECTION_BANK_VOLUME', sectionId: chorus!.id, bank: 'bass', level: -20 })
    expect(sectionBankLevel(state.songSections[0]!, 'drums')).toBe(0.35)
    expect(sectionBankLevel(state.songSections[1]!, 'bass')).toBe(0)
    expect(sectionBankLevel(state.songSections[1]!, 'drums')).toBe(1)
    expect(sectionBankLevel(state.songSections[2]!, 'drums')).toBe(1)
    expect(state.songSections[0]!.patternId).toBe(lastVerse!.patternId)

    state = reducer(state, { type: 'DUPLICATE_SONG_SECTION', sectionId: verse!.id })
    state = reducer(state, { type: 'SET_SONG_SECTION_BANK_VOLUME', sectionId: state.songSections[1]!.id, bank: 'drums', level: 120 })
    expect(sectionBankLevel(state.songSections[0]!, 'drums')).toBe(0.35)
    expect(sectionBankLevel(state.songSections[1]!, 'drums')).toBe(1)
  })
})
