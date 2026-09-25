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
