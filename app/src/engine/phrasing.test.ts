import { describe, expect, it } from 'vitest'
import { createInitialState } from '../state/defaults'
import { reducer } from '../state/reducer'
import { normalizePatterns } from './projectFile'
import { bankPhrasing, normalizePhrasing, planPhrasing } from './phrasing'
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
