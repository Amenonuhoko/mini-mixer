import { describe, expect, it } from 'vitest'
import { createInitialState } from '../state/defaults'
import { reducer } from '../state/reducer'
import { buildSongTimeline, sectionBankGain, sectionBankLevel, sectionFadeGain, songStepAt } from './songTimeline'
import type { SongSection } from '../state/types'

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

  it('duplicates a section as its own numbered part with an identical, independent pattern', () => {
    let state = createInitialState()
    state = reducer(state, { type: 'APPLY_SONG_TEMPLATE', sections: ['Intro', 'Verse'] })
    const verse = state.songSections[1]!
    const padId = state.pads[0]!.id
    state = reducer(state, { type: 'SET_ACTIVE_PATTERN', patternId: verse.patternId })
    state = reducer(state, { type: 'TOGGLE_STEP', patternId: verse.patternId, padId, stepIndex: 0, sampleId: 'kick' })
    state = reducer(state, { type: 'DUPLICATE_SONG_SECTION', sectionId: verse.id })
    const copy = state.songSections[2]!
    expect(state.songSections.map((section) => section.name)).toEqual(['Intro', 'Verse', 'Verse 2'])
    expect(copy.patternId).not.toBe(verse.patternId)
    const copied = state.patterns.find((pattern) => pattern.id === copy.patternId)!
    expect(copied.name).toBe('Verse 2')
    expect(copied.steps[padId]![0]).toBe('kick')
    // Independent: editing the copy leaves the original alone.
    state = reducer(state, { type: 'TOGGLE_STEP', patternId: copy.patternId, padId, stepIndex: 4, sampleId: 'kick' })
    expect(state.patterns.find((pattern) => pattern.id === verse.patternId)!.steps[padId]![4]).toBeNull()
    // The next copy counts on.
    state = reducer(state, { type: 'DUPLICATE_SONG_SECTION', sectionId: copy.id })
    expect(state.songSections.map((section) => section.name)).toEqual(['Intro', 'Verse', 'Verse 2', 'Verse 3'])
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

  it('keeps an edited section selected for looping after stop and replay', () => {
    let state = createInitialState()
    state = reducer(state, { type: 'APPLY_SONG_TEMPLATE', sections: ['Verse', 'Chorus', 'Verse'] })
    const chorus = state.songSections[1]!
    state = reducer(state, { type: 'SET_LOOP_MODE', loopMode: 'once' })
    state = reducer(state, { type: 'SET_ACTIVE_PATTERN', patternId: chorus.patternId })
    state = reducer(state, { type: 'AUDITION_SONG_SECTION', sectionId: chorus.id, scope: 'loop' })
    expect(state.transport.auditionScope).toBe('loop')
    expect(state.transport.auditionSectionId).toBe(chorus.id)
    expect(state.transport.isPlaying).toBe(true)
    expect(buildSongTimeline(state).find((span) => span.section.id === chorus.id)?.startStep).toBe(64)

    state = reducer(state, { type: 'SET_TRANSPORT_PLAYING', isPlaying: false })
    expect(state.transport.auditionSectionId).toBe(chorus.id)
    state = reducer(state, { type: 'SET_TRANSPORT_PLAYING', isPlaying: true })
    expect(state.transport.auditionSectionId).toBe(chorus.id)
    state = reducer(state, { type: 'AUDITION_SONG_SECTION', sectionId: state.songSections[0]!.id, scope: 'rest' })
    expect(state.transport.auditionScope).toBe('rest')
    state = reducer(state, { type: 'SET_TRANSPORT_PLAYING', isPlaying: false })
    expect(state.transport.auditionSectionId).toBeNull()
  })

  it('removes and restores a sound group from one section without erasing its mix or linked pattern', () => {
    let state = createInitialState()
    state = reducer(state, { type: 'APPLY_SONG_TEMPLATE', sections: ['Verse', 'Chorus', 'Verse'] })
    const first = state.songSections[0]!
    const last = state.songSections[2]!
    state = reducer(state, { type: 'SET_SONG_SECTION_BANK_VOLUME', sectionId: first.id, bank: 'chords', level: 45 })
    state = reducer(state, { type: 'SET_SONG_SECTION_BANK_INCLUDED', sectionId: first.id, bank: 'chords', included: false })
    expect(sectionBankGain(state.songSections[0]!, 'chords')).toBe(0)
    expect(sectionBankGain(state.songSections[2]!, 'chords')).toBe(1)
    expect(state.songSections[0]!.patternId).toBe(last.patternId)
    state = reducer(state, { type: 'SET_SONG_SECTION_BANK_INCLUDED', sectionId: first.id, bank: 'chords', included: true })
    expect(sectionBankGain(state.songSections[0]!, 'chords')).toBe(0.45)
  })
})

describe('section fades', () => {
  const section = (fades: Partial<SongSection>): SongSection => ({ id: 's', name: 'Verse', patternId: 'p', repeats: 4, ...fades })

  it('plays at full level with no fade, and for old sections that never stored one', () => {
    for (const step of [0, 31, 63]) expect(sectionFadeGain(section({}), step, 64)).toBe(1)
  })

  it('ramps up over the first bars and is at full level from there on', () => {
    const fade = section({ fadeInBars: 1 })
    const ramp = Array.from({ length: 16 }, (_, step) => sectionFadeGain(fade, step, 64))
    expect(ramp[0]).toBeGreaterThan(0)
    expect(ramp[15]).toBeLessThan(1)
    expect(ramp).toEqual([...ramp].sort((a, b) => a - b))
    expect(sectionFadeGain(fade, 16, 64)).toBe(1)
    expect(sectionFadeGain(fade, 63, 64)).toBe(1)
  })

  it('ramps down over the last bars, ending on its quietest step', () => {
    const fade = section({ fadeOutBars: 2 })
    expect(sectionFadeGain(fade, 31, 64)).toBe(1)
    const ramp = Array.from({ length: 32 }, (_, step) => sectionFadeGain(fade, 32 + step, 64))
    expect(ramp[0]).toBeLessThan(1)
    expect(ramp[31]).toBeGreaterThan(0)
    expect(ramp[31]).toBe(Math.min(...ramp))
    expect(ramp).toEqual([...ramp].sort((a, b) => b - a))
  })

  it('is limited to the section, and a fade-in and fade-out that meet take the quieter of the two', () => {
    // 16 steps can't hold a 4-bar fade: it stretches over the whole section.
    const long = section({ fadeInBars: 4 })
    expect(sectionFadeGain(long, 0, 16)).toBeCloseTo(1 / 17)
    expect(sectionFadeGain(long, 15, 16)).toBeCloseTo(16 / 17)
    const both = section({ fadeInBars: 1, fadeOutBars: 1 })
    expect(sectionFadeGain(both, 8, 16)).toBe(Math.min(9 / 17, 8 / 17))
    expect(sectionFadeGain(both, 8, 16)).toBeGreaterThan(0)
  })

  it('ignores stored nonsense', () => {
    expect(sectionFadeGain(section({ fadeInBars: Number.NaN, fadeOutBars: -3 }), 0, 64)).toBe(1)
  })
})

describe('editing several sections at once', () => {
  const songOf = (names: string[]) => reducer(createInitialState(), { type: 'APPLY_SONG_TEMPLATE', sections: names })

  it('sets fades on exactly the selected sections, leaving the others and an omitted fade alone', () => {
    let state = songOf(['Intro', 'Verse', 'Chorus'])
    const [intro, verse, chorus] = state.songSections
    state = reducer(state, { type: 'SET_SONG_SECTIONS_FADE', sectionIds: [intro!.id, chorus!.id], fadeInBars: 2, fadeOutBars: 1 })
    state = reducer(state, { type: 'SET_SONG_SECTIONS_FADE', sectionIds: [chorus!.id], fadeOutBars: 3 })
    expect(state.songSections[0]).toMatchObject({ fadeInBars: 2, fadeOutBars: 1 })
    expect(state.songSections[1]).toEqual(verse)
    expect(state.songSections[2]).toMatchObject({ fadeInBars: 2, fadeOutBars: 3 })
  })

  it('removes a fade set to 0 bars, and keeps stored values whole and bounded', () => {
    let state = songOf(['Intro', 'Verse'])
    const ids = state.songSections.map((section) => section.id)
    state = reducer(state, { type: 'SET_SONG_SECTIONS_FADE', sectionIds: ids, fadeInBars: 2.6, fadeOutBars: 999 })
    expect(state.songSections[0]).toMatchObject({ fadeInBars: 3, fadeOutBars: 64 })
    state = reducer(state, { type: 'SET_SONG_SECTIONS_FADE', sectionIds: ids, fadeInBars: 0, fadeOutBars: Number.NaN })
    for (const section of state.songSections) {
      expect('fadeInBars' in section).toBe(false)
      expect('fadeOutBars' in section).toBe(false)
    }
  })

  it('applies one bank\'s level and on/off to every selected section only', () => {
    let state = songOf(['Verse', 'Chorus', 'Verse'])
    const [a, b, c] = state.songSections.map((section) => section.id) as [string, string, string]
    state = reducer(state, { type: 'SET_SONG_SECTIONS_BANK_VOLUME', sectionIds: [a, c], bank: 'bass', level: 35.4 })
    state = reducer(state, { type: 'SET_SONG_SECTIONS_BANK_INCLUDED', sectionIds: [a, b], bank: 'chords', included: false })
    const [first, second, third] = state.songSections as [SongSection, SongSection, SongSection]
    expect([sectionBankLevel(first, 'bass'), sectionBankLevel(second, 'bass'), sectionBankLevel(third, 'bass')]).toEqual([0.35, 1, 0.35])
    expect([sectionBankGain(first, 'chords'), sectionBankGain(second, 'chords'), sectionBankGain(third, 'chords')]).toEqual([0, 0, 1])
    state = reducer(state, { type: 'SET_SONG_SECTIONS_BANK_INCLUDED', sectionIds: [a, b], bank: 'chords', included: true })
    expect(state.songSections.map((section) => sectionBankGain(section, 'chords'))).toEqual([1, 1, 1])
  })

  it('ignores a level that is not a number', () => {
    const state = songOf(['Verse'])
    expect(reducer(state, { type: 'SET_SONG_SECTIONS_BANK_VOLUME', sectionIds: [state.songSections[0]!.id], bank: 'bass', level: Number.NaN })).toBe(state)
  })
})
