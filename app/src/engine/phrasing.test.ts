import { describe, expect, it } from 'vitest'
import { createInitialState } from '../state/defaults'
import { reducer } from '../state/reducer'
import { normalizePatterns } from './projectFile'
import { bankPhrasing, mergeNoteEdit, normalizeNoteEdits, normalizePhrasing, noteTiming, planPhrasing } from './phrasing'
import type { Bank, Pattern, Phrasing } from '../state/types'

function fixture() {
  const state = createInitialState(2)
  const pads = state.pads
  const bank: Bank = { ...state.banks[3]!, kind: 'melody', sound: { type: 'preset', name: 'Clarinet' }, padIds: pads.map((pad) => pad.id), visibleCount: 2 }
  const pattern = state.patterns[0]!
  pattern.steps[pads[0]!.id]![0] = 'c'
  pattern.steps[pads[1]!.id]![4] = 'd'
  state.banks = [bank]
  return { state, pads, bank, pattern }
}

describe('musical phrasing', () => {
  it('releases wind notes before the next note on another pad and before a breath', () => {
    const { pattern, pads, bank } = fixture()
    pattern.steps[pads[0]!.id]![12] = 'c'
    const plan = planPhrasing(pattern, [bank], pads, 120)
    expect(plan.get(pads[0]!.id)![0]!.durationSeconds).toBeCloseTo(.5 * .82)
    expect(plan.get(pads[0]!.id)![12]!.durationSeconds).toBeCloseTo(.25 * .82)
    expect(plan.get(pads[0]!.id)![1]).toBeUndefined()
  })
  it('follows tempo and preserves original one-shots when requested', () => {
    const { pattern, pads, bank } = fixture()
    const settings: Phrasing = { articulation: 'connected', lengthSteps: 2, dynamics: 0 }
    pattern.phrasing = { melody: settings }
    expect(planPhrasing(pattern, [bank], pads, 60).get(pads[0]!.id)![0]!.durationSeconds).toBe(.5)
    expect(planPhrasing(pattern, [bank], pads, 120).get(pads[0]!.id)![0]!.durationSeconds).toBe(.25)
    pattern.phrasing.melody = { ...settings, articulation: 'natural' }
    expect(planPhrasing(pattern, [bank], pads, 120).get(pads[0]!.id)![0]).toEqual({ level: 1 })
  })
  it('uses stable accents without boosting over unity', () => {
    const { pattern, pads, bank } = fixture()
    pattern.steps[pads[0]!.id]![1] = 'c'
    pattern.phrasing = { melody: { articulation: 'detached', lengthSteps: 0, dynamics: 100 } }
    const first = planPhrasing(pattern, [bank], pads, 120)
    expect(first).toEqual(planPhrasing(pattern, [bank], pads, 120))
    expect(first.get(pads[0]!.id)![0]!.level).toBeGreaterThan(first.get(pads[0]!.id)![1]!.level)
    for (const row of first.values()) for (const note of row) if (note) expect(note.level).toBeLessThanOrEqual(1)
  })
  it('ignores muted notes and leaves drums with their original decay', () => {
    const { pattern, pads, bank } = fixture()
    pads[1]!.muted = true
    expect(planPhrasing(pattern, [bank], pads, 120).get(pads[0]!.id)![0]!.durationSeconds).toBeCloseTo(.82)
    expect(bankPhrasing(pattern, { ...bank, kind: 'drums', sound: null }).articulation).toBe('natural')
    expect(bankPhrasing(pattern, { ...bank, kind: 'chords', sound: { type: 'preset', name: 'Organ' } }).articulation).toBe('connected')
  })
  it('bounds settings loaded from a malformed project', () => {
    expect(normalizePhrasing({ melody: { articulation: 'connected', lengthSteps: -9, dynamics: 900 }, bass: { articulation: 'invalid' } })).toEqual({ melody: { articulation: 'connected', lengthSteps: 0, dynamics: 100 } })
  })
  it('supports undo, keep, copy and save/load without changing steps', () => {
    const { state, pattern, pads } = fixture()
    const phrasing: Phrasing = { articulation: 'short', lengthSteps: 2, dynamics: 65 }
    const preview = reducer(state, { type: 'PREVIEW_PATTERN_PHRASING', patternId: pattern.id, bank: 'melody', phrasing })
    expect(preview.patterns[0]!.steps).toEqual(pattern.steps)
    expect(preview.variationPreview!.patterns).toEqual(state.patterns)
    expect(reducer(preview, { type: 'UNDO_VARIATION' }).patterns).toEqual(state.patterns)
    const kept = reducer(preview, { type: 'KEEP_VARIATION' })
    const copy = reducer(kept, { type: 'ADD_PATTERN', copyFromId: pattern.id }).patterns.at(-1) as Pattern
    expect(copy.phrasing?.melody).toEqual(phrasing)
    expect(normalizePatterns(JSON.parse(JSON.stringify([copy])), pads)[0]!.phrasing?.melody).toEqual(phrasing)
  })
})

describe('per-note edits', () => {
  const natural: Phrasing = { articulation: 'natural', lengthSteps: 0, dynamics: 0 }
  /** A 16-step pattern, 120 bpm (an eighth of a second per step), with one note at step 0 of the first pad. */
  function plan(edit: (padId: string) => NonNullable<Pattern['noteEdits']>[string], phrasing: Phrasing = natural, bpm = 120) {
    const { pattern, pads, bank } = fixture()
    pattern.phrasing = { melody: phrasing }
    const padId = pads[0]!.id
    const edits = edit(padId)
    if (edits) pattern.noteEdits = { [padId]: edits }
    return planPhrasing(pattern, [bank], pads, bpm).get(padId)!
  }

  it('leaves a note alone when it has no edit', () => {
    expect(plan(() => ({}))[0]).toEqual({ level: 1 })
  })

  it('holds a note for exactly its length, whatever its phrasing would have done', () => {
    const held = plan(() => ({ '0': { lengthSteps: 4 } }))[0]!
    expect(held.durationSeconds).toBeCloseTo(.5)
    expect(held.stretchToSeconds).toBeUndefined()
    // Detached phrasing would have shaved it to 82% of the length; a set length is the length.
    const detached = plan(() => ({ '0': { lengthSteps: 2 } }), { articulation: 'detached', lengthSteps: 0, dynamics: 0 })[0]!
    expect(detached.durationSeconds).toBeCloseTo(.25)
  })

  it('runs a held note on past the next hit, but never past the end of the pattern', () => {
    const { pattern, pads, bank } = fixture()
    pattern.phrasing = { melody: natural }
    pattern.steps[pads[0]!.id]![1] = 'c'
    pattern.steps[pads[0]!.id]![14] = 'c'
    pattern.noteEdits = { [pads[0]!.id]: { '0': { lengthSteps: 8 }, '14': { lengthSteps: 8 } } }
    const planned = planPhrasing(pattern, [bank], pads, 120).get(pads[0]!.id)!
    expect(planned[0]!.durationSeconds).toBeCloseTo(1)
    expect(planned[14]!.durationSeconds).toBeCloseTo(.25)
  })

  it('turns a fade into seconds at the current tempo', () => {
    const edit = () => ({ '0': { lengthSteps: 8, fadeInSteps: 2, fadeOutSteps: 3 } })
    const note = plan(edit)[0]!
    expect(note.attackSeconds).toBeCloseTo(.25)
    expect(note.releaseSeconds).toBeCloseTo(.375)
    expect(plan(edit, natural, 60)[0]!.attackSeconds).toBeCloseTo(.5)
  })

  it('asks for a stretch only when the note has a length', () => {
    expect(plan(() => ({ '0': { lengthSteps: 4, stretch: true } }))[0]!.stretchToSeconds).toBeCloseTo(.5)
    expect(plan(() => ({ '0': { fadeInSteps: 1, stretch: true } }))[0]!.stretchToSeconds).toBeUndefined()
  })

  it('merges changes into a note\'s edit, where 0 removes and nothing left means no edit', () => {
    const first = mergeNoteEdit(undefined, { fadeInSteps: 2, lengthSteps: 4 })
    expect(first).toEqual({ fadeInSteps: 2, lengthSteps: 4 })
    expect(mergeNoteEdit(first, { stretch: true })).toEqual({ fadeInSteps: 2, lengthSteps: 4, stretch: true })
    expect(mergeNoteEdit(first, { fadeInSteps: 0 })).toEqual({ lengthSteps: 4 })
    // A stretch goes when the length does, and means nothing without one.
    expect(mergeNoteEdit({ lengthSteps: 4, stretch: true }, { lengthSteps: 0 })).toBeUndefined()
    expect(mergeNoteEdit(undefined, { stretch: true })).toBeUndefined()
    expect(mergeNoteEdit(undefined, { fadeInSteps: 99, lengthSteps: 999.6 })).toEqual({ fadeInSteps: 16, lengthSteps: 64 })
    expect(mergeNoteEdit(undefined, { fadeInSteps: Number.NaN })).toBeUndefined()
  })

  it('keeps only sensible saved edits, on lit steps that exist', () => {
    const steps = { a: ['x', null, 'x', null], b: [null, null, null, null] }
    const saved = { a: { '0': { lengthSteps: 2, junk: true }, '1': { lengthSteps: 2 }, '2': { fadeInSteps: 'lots' }, '9': { lengthSteps: 2 } }, b: { '0': { lengthSteps: 2 } }, gone: { '0': { lengthSteps: 2 } }, bad: 5 }
    expect(normalizeNoteEdits(saved, steps, 4)).toEqual({ a: { '0': { lengthSteps: 2 } } })
    expect(normalizeNoteEdits(undefined, steps, 4)).toBeUndefined()
    expect(normalizeNoteEdits('nope', steps, 4)).toBeUndefined()
  })
})

describe('note timing', () => {
  it('follows the natural length unless a duration cuts it short', () => {
    expect(noteTiming(2, undefined)).toEqual({ seconds: 2, rateScale: 1 })
    expect(noteTiming(2, { durationSeconds: .5 })).toEqual({ seconds: .5, rateScale: 1 })
    expect(noteTiming(.2, { durationSeconds: .5 })).toEqual({ seconds: .2, rateScale: 1 })
  })

  it('stretches a sound to its target: slower to lengthen it, faster to shorten it', () => {
    expect(noteTiming(.5, { durationSeconds: 1, stretchToSeconds: 1 })).toEqual({ seconds: 1, rateScale: .5 })
    expect(noteTiming(1, { durationSeconds: .5, stretchToSeconds: .5 })).toEqual({ seconds: .5, rateScale: 2 })
  })

  it('caps a stretch at four times either way, so the note then ends short of, or past, its target', () => {
    expect(noteTiming(.1, { durationSeconds: 10, stretchToSeconds: 10 })).toEqual({ seconds: .4, rateScale: .25 })
    const squeezed = noteTiming(8, { durationSeconds: .5, stretchToSeconds: .5 })
    expect(squeezed.rateScale).toBe(4)
    expect(squeezed.seconds).toBe(.5)
  })
})
