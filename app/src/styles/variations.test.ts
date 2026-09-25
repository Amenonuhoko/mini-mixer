import { STYLES } from './library'
import { pickProgression } from './generator'
import { describe, expect, it } from 'vitest'
import { createInitialState } from '../state/defaults'
import { reducer } from '../state/reducer'
import { varyPattern } from './variations'

function fixture() {
  const state = createInitialState()
  const pattern = state.patterns[0]!
  for (const bank of state.banks) {
    const id = bank.padIds[0]!
    pattern.steps[id] = Array.from({ length: 16 }, (_, i) => i % 4 === 0 ? bank.kind + '-sample' : null)
  }
  return state
}
const count = (steps: Record<string, (string | null)[]>) => Object.values(steps).flat().filter(Boolean).length

describe('musical variations', () => {
  it('changes density while preserving locked parts and source data', () => {
    const state = fixture(), source = state.patterns[0]!
    const before = JSON.stringify(source)
    const sparse = varyPattern(state, source, 'sparser', ['bass'])
    const busy = varyPattern(state, source, 'busier', ['bass'])
    expect(count(sparse.steps)).toBeLessThan(count(source.steps))
    expect(count(busy.steps)).toBeGreaterThan(count(source.steps))
    const bass = state.banks.find((bank) => bank.kind === 'bass')!
    for (const id of bass.padIds) {
      expect(sparse.steps[id]).toEqual(source.steps[id])
      expect(busy.steps[id]).toEqual(source.steps[id])
    }
    expect(JSON.stringify(source)).toBe(before)
  })
  it('moves rhythm within the beat without changing note samples', () => {
    const state = fixture(), source = state.patterns[0]!
    const next = varyPattern(state, source, 'syncopated', [])
    expect(count(next.steps)).toBe(count(source.steps))
    expect(next.steps).not.toEqual(source.steps)
    expect(new Set(Object.values(next.steps).flat())).toEqual(new Set(Object.values(source.steps).flat()))
  })
  it('limits bass dropout to the last beat and leaves the other banks intact', () => {
    const state = fixture(), source = state.patterns[0]!
    const next = varyPattern(state, source, 'bass-drop', [])
    for (const bank of state.banks) for (const id of bank.padIds) {
      if (bank.kind === 'bass') {
        expect(next.steps[id]?.slice(0, 12)).toEqual(source.steps[id]?.slice(0, 12))
        expect(next.steps[id]?.slice(12).some(Boolean)).toBe(false)
      } else expect(next.steps[id]).toEqual(source.steps[id])
    }
  })
  it('keeps audition undo available during playback and restores exact patterns', () => {
    const original = fixture()
    original.transport.auditionSectionId = original.songSections[0]!.id
    original.transport.auditionScope = 'loop'
    let next = reducer(original, { type: 'PREVIEW_VARIATION', kind: 'sparser', locked: [], seed: 1 })
    next = reducer(next, { type: 'SET_TRANSPORT_PLAYING', isPlaying: true })
    expect(next.variationPreview).toBeDefined()
    next = reducer(next, { type: 'UNDO_VARIATION' })
    expect(next.patterns).toEqual(original.patterns)
    expect(next.transport.isPlaying).toBe(false)
    expect(next.transport.auditionSectionId).toBe(original.transport.auditionSectionId)
    expect(next.transport.auditionScope).toBe('loop')
  })
  it('accepts a preview before later edits so undo cannot erase new work', () => {
    const original = fixture()
    let next = reducer(original, { type: 'PREVIEW_VARIATION', kind: 'busier', locked: [], seed: 1 })
    next = reducer(next, { type: 'RENAME_PATTERN', patternId: next.activePatternId, name: 'My edit' })
    expect(next.variationPreview).toBeUndefined()
    expect(reducer(next, { type: 'UNDO_VARIATION' })).toBe(next)
  })
  it('builds related song parts, links repeats, and can undo the entire arrangement', () => {
    let original = fixture()
    original = reducer(original, { type: 'APPLY_SONG_TEMPLATE', sections: ['Verse', 'Chorus', 'Verse'] })
    const next = reducer(original, { type: 'PREVIEW_RELATED_SONG', locked: ['bass'] })
    expect(next.songSections[0]!.patternId).toBe(next.songSections[2]!.patternId)
    expect(next.songSections[0]!.patternId).not.toBe(next.songSections[1]!.patternId)
    const verse = next.patterns.find((item) => item.id === next.songSections[0]!.patternId)!
    const chorus = next.patterns.find((item) => item.id === next.songSections[1]!.patternId)!
    expect(count(chorus.steps)).toBeGreaterThan(count(verse.steps))
    expect(next.patterns.slice(0, original.patterns.length)).toEqual(original.patterns)
    const undone = reducer(next, { type: 'UNDO_VARIATION' })
    expect(undone.patterns).toEqual(original.patterns)
    expect(undone.songSections).toEqual(original.songSections)
  })
})


it('remembers locks across navigation and audition undo', () => {
  let state = fixture()
  state = reducer(state, { type: 'SET_VARIATION_LOCKS', locked: ['bass', 'chords'] })
  state = reducer(state, { type: 'PREVIEW_VARIATION', kind: 'busier', locked: ['bass', 'chords'], seed: 5 })
  state = reducer(state, { type: 'SET_VARIATION_LOCKS', locked: ['bass'] })
  state = reducer(state, { type: 'UNDO_VARIATION' })
  expect(state.patterns[0]!.variationLocks).toEqual(['bass'])
})

it('creates evolving repeats and last-repeat transitions without extending the song', () => {
  let state = fixture()
  state = reducer(state, { type: 'APPLY_SONG_TEMPLATE', sections: ['Verse', 'Chorus', 'Verse', 'Chorus'] })
  const length = state.songSections.reduce((sum, section) => sum + state.patterns.find((p) => p.id === section.patternId)!.stepCount * section.repeats, 0)
  const next = reducer(state, { type: 'PREVIEW_RELATED_SONG', locked: ['bass'], evolve: true, transition: 'pause', seed: 42 })
  expect(next.songSections.filter((section) => section.name.endsWith('ending')).length).toBeGreaterThan(0)
  expect(new Set(next.songSections.filter((section) => section.name === 'Verse').map((section) => section.patternId)).size).toBe(2)
  expect(next.songSections.reduce((sum, section) => sum + next.patterns.find((p) => p.id === section.patternId)!.stepCount * section.repeats, 0)).toBe(length)
  const bass = state.banks.find((bank) => bank.kind === 'bass')!
  for (const pattern of next.patterns.slice(state.patterns.length)) for (const id of bass.padIds) expect(pattern.steps[id]).toEqual(state.patterns[0]!.steps[id])
})

it('manual new takes offer more than two outcomes without changing sample identity', () => {
  const state = fixture(), source = state.patterns[0]!
  const results = Array.from({ length: 8 }, (_, seed) => varyPattern(state, source, 'new-take', ['chords'], seed))
  expect(new Set(results.map((pattern) => JSON.stringify(pattern.steps))).size).toBeGreaterThan(4)
  for (const pattern of results) expect(count(pattern.steps)).toBe(count(source.steps))
})


it('regenerates varied preset drums while leaving locked layers byte-for-byte intact', () => {
  const state = fixture(), source = state.patterns[0]!
  const style = STYLES.find((item) => item.id === 'house')!
  const drums = state.banks.find((bank) => bank.kind === 'drums')!
  drums.sound = { type: 'kit', kitId: 'electronic-drums' }
  for (const id of drums.padIds) state.pads.find((pad) => pad.id === id)!.sampleId = id + '-sound'
  source.groove = { seed: 123, bars: 1, progression: pickProgression(style, 123), layers: { drums: { styleId: style.id, take: 0, intensity: .7 } } }
  const results = Array.from({ length: 8 }, (_, seed) => varyPattern(state, source, 'new-take', ['bass', 'chords', 'melody'], seed))
  expect(new Set(results.map((pattern) => JSON.stringify(pattern.steps))).size).toBeGreaterThan(2)
  for (const result of results) for (const bank of state.banks.filter((bank) => bank.kind !== 'drums')) for (const id of bank.padIds) expect(result.steps[id]).toEqual(source.steps[id])
})
