import { describe, expect, it } from 'vitest'
import { DRUM_KITS } from '../engine/drumSynth'
import { buildSongTimeline, handoverRange } from '../engine/songTimeline'
import { createInitialState, createPad } from './defaults'
import { reducer } from './reducer'
import { canApplyMove, endingCarrier, withSectionEnding } from './sectionEnding'
import type { AppState, Sample } from './types'

const ids = { section: 'section-ending', pattern: 'pattern-ending' }
const hits = (state: AppState, patternId: string) =>
  Object.values(state.patterns.find((pattern) => pattern.id === patternId)!.steps).flat().filter(Boolean).length

/** A one-bar beat on every bank, with a real drum kit so fills have a snare to play. */
function song(repeats = 4): AppState {
  const state = createInitialState()
  const pattern = state.patterns[0]!
  pattern.stepCount = 16
  const drums = state.banks.find((bank) => bank.kind === 'drums')!
  drums.sound = { type: 'kit', kitId: 'electronic-drums' }
  const kit = DRUM_KITS.find((item) => item.id === 'electronic-drums')!
  for (const [index, id] of drums.padIds.entries()) {
    if (!kit.voices[index]) continue
    state.pads.find((pad) => pad.id === id)!.sampleId = id + '-sound'
    state.samples[id + '-sound'] = { id: id + '-sound' } as Sample
  }
  // Only Drums starts with pads; give Bass one so a bass drop has something to drop.
  const bassPad = createPad(state.pads.length)
  state.pads.push(bassPad)
  state.banks.find((bank) => bank.kind === 'bass')!.padIds = [bassPad.id]
  for (const id of [drums.padIds[0]!, bassPad.id]) pattern.steps[id] = Array.from({ length: 16 }, (_, i) => i % 4 === 0 ? id + '-note' : null)
  state.songSections = [
    { id: 'verse', name: 'Verse', patternId: pattern.id, repeats },
    { id: 'chorus', name: 'Chorus', patternId: pattern.id, repeats: 1 },
  ]
  return state
}

describe('section endings', () => {
  it('splits the final repeat off as "<name> ending" and bakes the move into its own pattern', () => {
    const state = song(4), base = state.patterns[0]!
    const next = { ...state, ...withSectionEnding(state, 'verse', 'pause', ids)! }
    expect(next.songSections.map((section) => [section.name, section.repeats])).toEqual([['Verse', 3], ['Verse ending', 1], ['Chorus', 1]])
    const ending = next.songSections[1]!
    expect(ending.ending).toEqual({ move: 'pause', basePatternId: base.id, of: 'verse' })
    expect(endingCarrier(next.songSections, 'verse')?.id).toBe(ending.id)
    // Stop: the last beat is empty; the verse and chorus still play the original pattern.
    const baked = next.patterns.find((pattern) => pattern.id === ending.patternId)!
    for (const row of Object.values(baked.steps)) expect(row.slice(12).every((cell) => !cell)).toBe(true)
    expect(next.patterns.find((pattern) => pattern.id === base.id)!.steps).toEqual(base.steps)
    expect(buildSongTimeline(next).at(-1)!.endStep).toBe(buildSongTimeline(state).at(-1)!.endStep)
  })

  it('gives a single, shared pass its own copy instead of changing the other sections', () => {
    const state = song(1), base = state.patterns[0]!
    const next = { ...state, ...withSectionEnding(state, 'verse', 'bass-drop', ids)! }
    expect(next.songSections.map((section) => section.name)).toEqual(['Verse', 'Chorus'])
    expect(next.songSections[0]!.patternId).toBe(ids.pattern)
    expect(next.songSections[1]!.patternId).toBe(base.id)
  })

  it('writes a new move from the original rather than on top of the old one', () => {
    const state = song(4)
    const withBuild = { ...state, ...withSectionEnding(state, 'verse', 'build', ids)! }
    const endingId = withBuild.songSections[1]!.patternId
    expect(hits(withBuild, endingId)).toBeGreaterThan(hits(state, state.patterns[0]!.id))
    const withStop = { ...withBuild, ...withSectionEnding(withBuild, 'verse', 'pause', ids)! }
    expect(withStop.songSections).toHaveLength(3)
    expect(withStop.songSections[1]!.ending?.move).toBe('pause')
    // The roll is gone: Stop only takes the last beat's two hits out of the original.
    expect(hits(withStop, endingId)).toBe(hits(state, state.patterns[0]!.id) - 2)
  })

  it('folds a split ending back into its section when taken out', () => {
    const state = song(4)
    const withFill = { ...state, ...withSectionEnding(state, 'verse', 'fill', ids)! }
    const removed = { ...withFill, ...withSectionEnding(withFill, 'verse', null, ids)! }
    expect(removed.songSections.map((section) => [section.name, section.repeats])).toEqual([['Verse', 4], ['Chorus', 1]])
    expect(removed.patterns.some((pattern) => pattern.id === ids.pattern)).toBe(false)
  })

  it('only offers drum moves when there is a drum sound to play them', () => {
    const state = song(4)
    expect(canApplyMove(state, 'verse', 'build')).toBe(true)
    state.banks.find((bank) => bank.kind === 'drums')!.sound = null
    expect(canApplyMove(state, 'verse', 'build')).toBe(false)
    expect(canApplyMove(state, 'verse', 'pause')).toBe(true)
  })

  it('previews through Keep / Undo and plays the handover into the next section', () => {
    const state = song(4)
    const previewed = reducer(state, { type: 'PREVIEW_SECTION_ENDING', sectionId: 'verse', move: 'fill', ids })
    expect(previewed.variationPreview?.label).toBe('Ending')
    expect(previewed.transport).toMatchObject({ isPlaying: true, playMode: 'song', auditionScope: 'handover', auditionSectionId: ids.section })
    // Trying another move replaces the first, still undoable back to the start.
    const again = reducer(previewed, { type: 'PREVIEW_SECTION_ENDING', sectionId: 'verse', move: 'pause', ids })
    expect(again.songSections).toHaveLength(3)
    expect(again.songSections[1]!.ending?.move).toBe('pause')
    const undone = reducer(again, { type: 'UNDO_VARIATION' })
    expect(undone.songSections).toEqual(state.songSections)
    expect(undone.patterns).toEqual(state.patterns)
    const kept = reducer(again, { type: 'KEEP_VARIATION' })
    expect(kept.variationPreview).toBeUndefined()
    expect(kept.songSections).toHaveLength(3)
  })

  it('hears the last two bars of a section and the first bar of the next', () => {
    const state = song(4)
    const spans = buildSongTimeline(state)
    expect(handoverRange(spans, 'verse')).toEqual({ start: 32, end: 80 })
    expect(handoverRange(spans, 'chorus')).toEqual({ start: 64, end: 80 })
  })
})
