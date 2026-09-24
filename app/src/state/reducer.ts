import { tonicMidi } from '../music/theory'
import {
  BPM_MIN,
  BPM_MAX,
  EFFECT_MAX,
  EFFECT_MIN,
  MIN_PAD_COUNT,
  MAX_PAD_COUNT,
  MAX_STEP_COUNT,
  MIN_STEP_COUNT,
  STEP_ADD_COUNT,
  MIN_TRIM_GAP,
  MIX_LEVEL_MAX,
  MIX_LEVEL_MIN,
} from './constants'
import { bankOfPad, getActiveBank, getSamplerBank, soundKey } from './banks'
import { createId, createInitialState, createNeutralEffects, createPad } from './defaults'
import { resolveSequenceTraceCell } from '../utils/sequenceTraceLoad'
import type {
  AppState,
  Bank,
  BankBuild,
  CharacterPreset,
  EffectId,
  LoopMode,
  MoodId,
  MusicalKey,
  Pad,
  PadLabelSettings,
  PerformSettings,
  Groove,
  PadLayout,
  PadPlaybackMode,
  Pattern,
  Sample,
  SequenceTrace,
} from './types'

export type Action =
  | { type: 'ADD_SAMPLE'; sample: Sample }
  /** Adds a sample onto the next pad of the Drums (sampler) bank. */
  | { type: 'ADD_SAMPLE_TO_NEW_PAD'; sample: Sample }
  | { type: 'REMOVE_SAMPLE'; sampleId: string }
  | { type: 'RENAME_SAMPLE'; sampleId: string; label: string }
  | { type: 'MOVE_SAMPLE'; sampleId: string; direction: 'up' | 'down' }
  | { type: 'SET_ACTIVE_BANK'; bankId: string }
  /**
   * Lays freshly built pads onto one or more banks in one step — a sound
   * change, a key/mood change, or a layout change. `remap` decides how
   * already-programmed steps follow: 'index' keeps each step on the pad in
   * the same position (same scale degree across a key change), 'pitch' moves
   * it to the pad whose pitch is nearest (a layout change).
   */
  | {
      type: 'APPLY_BANK_BUILDS'
      builds: BankBuild[]
      remap: 'index' | 'pitch'
      key?: MusicalKey
      mood?: MoodId | null
      padLayout?: PadLayout
    }
  | { type: 'SET_PAD_LABELS'; labels: PadLabelSettings }
  | { type: 'SET_PERFORM'; perform: Partial<PerformSettings> }
  | { type: 'SET_GROOVE'; groove: Groove | null }
  /** Empties a pattern and sets its exact length — the clean slate a starter beat is written onto. */
  | { type: 'START_PATTERN'; patternId: string; stepCount: number }
  /** Replaces one bank's rows in a pattern (the other banks' rows are untouched) — how a preset adds a layer. */
  | { type: 'WRITE_BANK_PATTERN'; bankId: string; patternId: string; stepsByPadIndex: Record<number, number[]>; minStepCount: number }
  | { type: 'ASSIGN_SAMPLE_TO_PAD'; padId: string; sampleId: string | null }
  | { type: 'SET_PAD_MUTED'; padId: string; muted: boolean }
  | { type: 'SET_PAD_EFFECTS_BYPASSED'; padId: string; bypassed: boolean }
  | { type: 'SET_PAD_EFFECT'; padId: string; effectId: EffectId; value: number }
  | { type: 'RESET_PAD_EFFECTS'; padId: string }
  /** Whole-bank effects: these act on the active bank's showing pads. */
  | { type: 'APPLY_EFFECT_PRESET_TO_ALL_PADS'; filter: number; grit: number; echo: number; reverb: number }
  | { type: 'SET_ALL_PADS_EFFECT'; effectId: EffectId; value: number }
  | { type: 'SET_ALL_PADS_EFFECTS_BYPASSED'; bypassed: boolean }
  | { type: 'RESET_ALL_PADS_EFFECTS' }
  | { type: 'SET_PAD_TRIM'; padId: string; trimStart: number; trimEnd: number }
  | { type: 'SET_PAD_MIX_LEVEL'; padId: string; level: number }
  | { type: 'TOGGLE_STEP'; patternId: string; padId: string; stepIndex: number; sampleId: string | null }
  | { type: 'SET_STEP_SAMPLE'; patternId: string; padId: string; stepIndex: number; sampleId: string }
  | { type: 'CLEAR_PATTERN'; patternId: string }
  | { type: 'ADD_PATTERN_STEPS'; patternId: string }
  | { type: 'REMOVE_PATTERN_STEPS'; patternId: string }
  | { type: 'CAPTURE_PATTERN_TRACE'; patternId: string }
  | { type: 'RESTORE_PATTERN_TRACE'; patternId: string }
  | { type: 'CLEAR_PATTERN_TRACE'; patternId: string }
  | { type: 'LOAD_SEQUENCE_TRACE'; patternId: string; trace: SequenceTrace; markerSampleId: string }
  | { type: 'ADD_PATTERN'; copyFromId?: string }
  | { type: 'RENAME_PATTERN'; patternId: string; name: string }
  | { type: 'SET_ACTIVE_PATTERN'; patternId: string }
  | { type: 'ADD_SONG_SECTION'; afterId?: string }
  | { type: 'UPDATE_SONG_SECTION'; sectionId: string; name?: string; patternId?: string; repeats?: number }
  | { type: 'DUPLICATE_SONG_SECTION'; sectionId: string }
  | { type: 'MOVE_SONG_SECTION'; sectionId: string; direction: -1 | 1 }
  | { type: 'REMOVE_SONG_SECTION'; sectionId: string }
  | { type: 'SET_PLAY_MODE'; mode: 'pattern' | 'song' }
  | { type: 'SET_CURRENT_SONG_SECTION'; sectionId: string | null }
  /** Resizes one bank's showing pads (the active bank unless bankId is given). */
  | { type: 'SET_VISIBLE_PAD_COUNT'; count: number; bankId?: string }
  | { type: 'REMOVE_PAD'; padId: string }
  | { type: 'SET_BPM'; bpm: number }
  | { type: 'SET_TRANSPORT_PLAYING'; isPlaying: boolean }
  | { type: 'SET_LOOP_MODE'; loopMode: LoopMode }
  | { type: 'SET_METRONOME_ENABLED'; enabled: boolean }
  | { type: 'SET_PAD_PLAYBACK_MODE'; mode: PadPlaybackMode }
  | { type: 'SET_MASTER_VOLUME'; level: number }
  | { type: 'SET_PAD_LOOP_MODE_ENABLED'; enabled: boolean }
  | { type: 'SET_PAD_MIXER_MODE_ENABLED'; enabled: boolean }
  | { type: 'SET_PLAYTHROUGH_RECORDING_ENABLED'; enabled: boolean }
  | { type: 'CLEAR_ALL' }
  | { type: 'LOAD_PROJECT'; state: AppState }

const CHARACTER_IDS = ['filter', 'grit', 'echo', 'reverb'] as const
const NEUTRAL_CHARACTER: CharacterPreset = { filter: 0, grit: 0, echo: 0, reverb: 0 }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function updatePad(state: AppState, padId: string, update: (pad: Pad) => Pad): AppState {
  return {
    ...state,
    pads: state.pads.map((pad) => (pad.id === padId ? update(pad) : pad)),
  }
}

function updateBank(state: AppState, bankId: string, update: (bank: Bank) => Bank): AppState {
  return { ...state, banks: state.banks.map((bank) => (bank.id === bankId ? update(bank) : bank)) }
}

/** Sets a pad's Filter/Grit/Echo/Reverb to a remembered combo (neutral if none), leaving Pitch/Speed/Volume/Pan alone. */
function withCharacterEffects(pad: Pad, preset: CharacterPreset | undefined): Pad {
  const values = preset ?? NEUTRAL_CHARACTER
  return {
    ...pad,
    effects: pad.effects.map((effect) =>
      effect.id === 'filter' || effect.id === 'grit' || effect.id === 'echo' || effect.id === 'reverb'
        ? { ...effect, value: values[effect.id] }
        : effect,
    ),
  }
}

/**
 * Remembers the active bank's current whole-bank Filter/Grit/Echo/Reverb
 * under its sound (AppState.fxBySound), so switching the bank to another
 * sound and back later recalls it. A no-op for a bank without a sound.
 */
function rememberBankCharacter(state: AppState, bank: Bank, preset: CharacterPreset | null): AppState['fxBySound'] {
  const key = soundKey(bank.sound)
  if (!key) return state.fxBySound
  if (!preset) {
    const { [key]: _forgotten, ...rest } = state.fxBySound
    return rest
  }
  return { ...state.fxBySound, [key]: preset }
}

/** Applies `update` to the active bank's showing pads only. */
function updateActiveBankPads(state: AppState, update: (pad: Pad) => Pad): { pads: Pad[]; bank: Bank } {
  const bank = getActiveBank(state)
  const showing = new Set(bank.padIds.slice(0, bank.visibleCount))
  return { bank, pads: state.pads.map((pad) => (showing.has(pad.id) ? update(pad) : pad)) }
}

function updatePattern(state: AppState, patternId: string, update: (pattern: Pattern) => Pattern): AppState {
  return {
    ...state,
    patterns: state.patterns.map((pattern) => (pattern.id === patternId ? update(pattern) : pattern)),
  }
}

/** Adds an empty row for each new pad to every pattern. */
function withEmptyRows(patterns: Pattern[], padIds: string[]): Pattern[] {
  if (padIds.length === 0) return patterns
  return patterns.map((pattern) => ({
    ...pattern,
    steps: {
      ...pattern.steps,
      ...Object.fromEntries(padIds.map((id) => [id, new Array<string | null>(pattern.stepCount).fill(null)])),
    },
  }))
}

/**
 * Removes hidden generated samples (kind 'note') once nothing needs them —
 * no pad plays them, no bank keeps them as its current sound, and no
 * programmed sequencer cell still references them.
 */
function removeUnusedNoteSamples(state: AppState): AppState {
  const inUse = new Set<string>()
  for (const bank of state.banks) {
    for (const sampleId of bank.generatedSampleIds) inUse.add(sampleId)
    for (const sampleId of Object.values(bank.noteSampleIds)) inUse.add(sampleId)
  }
  for (const pad of state.pads) {
    if (pad.sampleId) inUse.add(pad.sampleId)
  }
  for (const pattern of state.patterns) {
    for (const steps of Object.values(pattern.steps)) {
      for (const sampleId of steps) {
        if (sampleId) inUse.add(sampleId)
      }
    }
  }

  const unusedNoteIds = state.sampleOrder.filter(
    (sampleId) => state.samples[sampleId]?.kind === 'note' && !inUse.has(sampleId),
  )
  if (unusedNoteIds.length === 0) return state

  const unused = new Set(unusedNoteIds)
  const samples = { ...state.samples }
  for (const sampleId of unused) delete samples[sampleId]
  return {
    ...state,
    samples,
    sampleOrder: state.sampleOrder.filter((sampleId) => !unused.has(sampleId)),
  }
}

function remapPatternSteps(pattern: Pattern, sampleMap: Map<string, string>, rowMoves: Map<string, string>): Pattern {
  const steps: Record<string, Array<string | null>> = Object.fromEntries(
    Object.entries(pattern.steps).map(([padId, row]) => [
      padId,
      row.map((sampleId) => (sampleId ? sampleMap.get(sampleId) ?? sampleId : null)),
    ]),
  )
  const sources = new Map([...rowMoves.keys()].map((from) => [from, steps[from]]))
  for (const from of rowMoves.keys()) {
    if (steps[from]) steps[from] = new Array<string | null>(pattern.stepCount).fill(null)
  }
  for (const [from, to] of rowMoves) {
    const source = sources.get(from)
    if (!source) continue
    const target = steps[to] ?? new Array<string | null>(pattern.stepCount).fill(null)
    steps[to] = target.map((cell, i) => cell ?? source[i] ?? null)
  }
  return { ...pattern, steps }
}

/**
 * Lays one build onto its bank: grows the bank's pad slots if needed, puts
 * each pad's new sound/music in place, and works out how existing steps
 * should follow (see APPLY_BANK_BUILDS' `remap`). Returns the updated state
 * plus the old→new sample mapping for the caller to apply to patterns.
 */
function applyBankBuild(
  state: AppState,
  build: BankBuild,
  remap: 'index' | 'pitch',
  /** Semitones the old key's home note moved in this bank's register — how pool notes transpose. */
  keyShift: number,
): { state: AppState; sampleMap: Map<string, string>; rowMoves: Map<string, string> } {
  const bank = state.banks.find((item) => item.id === build.bankId)
  const sampleMap = new Map<string, string>()
  const rowMoves = new Map<string, string>()
  if (!bank) return { state, sampleMap, rowMoves }

  const needed = Math.min(MAX_PAD_COUNT, build.pads.length)
  const newPads = Array.from({ length: Math.max(0, needed - bank.padIds.length) }, (_, i) =>
    createPad(bank.padIds.length + i),
  )
  const padIds = [...bank.padIds, ...newPads.map((pad) => pad.id)]
  const newPadIds = new Set(newPads.map((pad) => pad.id))
  const soundChanged = soundKey(bank.sound) !== soundKey(build.sound)
  const character = state.fxBySound[soundKey(build.sound) ?? ''] ?? undefined

  const padsById = new Map([...state.pads, ...newPads].map((pad) => [pad.id, pad]))
  const oldGenerated = new Set(bank.generatedSampleIds)

  // Old generated sounds → their new equivalents, so programmed steps follow.
  const oldShowing = bank.padIds.slice(0, bank.visibleCount).map((id) => padsById.get(id)).filter((pad): pad is Pad => !!pad)
  if (remap === 'index') {
    oldShowing.forEach((pad, index) => {
      const next = build.pads[index]?.sampleId
      if (pad.sampleId && next && oldGenerated.has(pad.sampleId) && pad.sampleId !== next) sampleMap.set(pad.sampleId, next)
    })
  } else {
    for (const pad of oldShowing) {
      if (!pad.sampleId || !pad.music || !oldGenerated.has(pad.sampleId)) continue
      const pitch = pad.music.midis[0]!
      let best: { sampleId: string; padId: string; distance: number } | null = null
      for (let index = 0; index < needed; index++) {
        const candidate = build.pads[index]!
        if (!candidate.sampleId || !candidate.music) continue
        const distance = Math.abs(candidate.music.midis[0]! - pitch)
        if (!best || distance < best.distance) best = { sampleId: candidate.sampleId, padId: padIds[index]!, distance }
      }
      if (!best) continue
      const { sampleId, padId } = best
      if (sampleId !== pad.sampleId) sampleMap.set(pad.sampleId, sampleId)
      if (padId !== pad.id) rowMoves.set(pad.id, padId)
    }
  }

  // Single notes from the old pool that steps may hold directly (arpeggio and
  // strum recordings) follow too: transposed with the key, then snapped to
  // the nearest note the new pool has.
  const newPool = Object.entries(build.noteSampleIds).map(([midi, sampleId]) => ({ midi: Number(midi), sampleId }))
  if (newPool.length > 0) {
    for (const [midi, sampleId] of Object.entries(bank.noteSampleIds)) {
      if (sampleMap.has(sampleId)) continue
      const target = Number(midi) + keyShift
      const nearest = newPool.reduce((best, note) => (Math.abs(note.midi - target) < Math.abs(best.midi - target) ? note : best))
      if (nearest.sampleId !== sampleId) sampleMap.set(sampleId, nearest.sampleId)
    }
  }

  const updatedPads = new Map<string, Pad>()
  padIds.slice(0, needed).forEach((padId, index) => {
    const pad = padsById.get(padId)!
    const target = build.pads[index]!
    const laid: Pad = { ...pad, sampleId: target.sampleId, music: target.music, trimStart: 0, trimEnd: 1 }
    updatedPads.set(padId, soundChanged || newPadIds.has(padId) ? withCharacterEffects(laid, character) : laid)
  })
  // Slots the new layout doesn't use drop the old generated sound rather than hide it.
  for (const padId of padIds.slice(needed)) {
    const pad = padsById.get(padId)!
    if (pad.sampleId && oldGenerated.has(pad.sampleId)) updatedPads.set(padId, { ...pad, sampleId: null, music: null })
  }

  const addedSamples = build.samples.filter((sample) => !state.samples[sample.id])
  return {
    sampleMap,
    rowMoves,
    state: {
      ...state,
      samples: { ...state.samples, ...Object.fromEntries(build.samples.map((sample) => [sample.id, sample])) },
      sampleOrder: [...state.sampleOrder, ...addedSamples.map((sample) => sample.id)],
      pads: [...state.pads.map((pad) => updatedPads.get(pad.id) ?? pad), ...newPads.map((pad) => updatedPads.get(pad.id) ?? pad)],
      banks: state.banks.map((item) =>
        item.id === bank.id
          ? {
              ...item,
              padIds,
              visibleCount: needed,
              sound: build.sound,
              columns: build.columns,
              generatedSampleIds: build.samples.map((sample) => sample.id),
              noteSampleIds: build.noteSampleIds,
            }
          : item,
      ),
      patterns: withEmptyRows(state.patterns, newPads.map((pad) => pad.id)),
    },
  }
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ADD_SAMPLE':
      return {
        ...state,
        samples: { ...state.samples, [action.sample.id]: action.sample },
        sampleOrder: [...state.sampleOrder, action.sample.id],
      }

    case 'ADD_SAMPLE_TO_NEW_PAD': {
      const bank = getSamplerBank(state)
      if (bank.visibleCount >= MAX_PAD_COUNT) return state
      const existingId = bank.padIds[bank.visibleCount]
      const newPad = existingId ? null : createPad(bank.padIds.length)
      const targetId = existingId ?? newPad!.id
      const assign = (pad: Pad): Pad =>
        pad.id === targetId ? { ...pad, sampleId: action.sample.id, trimStart: 0, trimEnd: 1, music: null } : pad
      return {
        ...state,
        samples: { ...state.samples, [action.sample.id]: action.sample },
        sampleOrder: [...state.sampleOrder, action.sample.id],
        pads: newPad ? [...state.pads, assign(newPad)] : state.pads.map(assign),
        banks: state.banks.map((item) =>
          item.id === bank.id
            ? { ...item, padIds: newPad ? [...item.padIds, newPad.id] : item.padIds, visibleCount: item.visibleCount + 1 }
            : item,
        ),
        patterns: withEmptyRows(state.patterns, newPad ? [newPad.id] : []),
      }
    }

    case 'REMOVE_SAMPLE': {
      const { [action.sampleId]: _removed, ...remainingSamples } = state.samples
      return {
        ...state,
        samples: remainingSamples,
        sampleOrder: state.sampleOrder.filter((id) => id !== action.sampleId),
        pads: state.pads.map((pad) => (pad.sampleId === action.sampleId ? { ...pad, sampleId: null } : pad)),
      }
    }

    case 'RENAME_SAMPLE': {
      const sample = state.samples[action.sampleId]
      if (!sample) return state
      const label = action.label.trim()
      if (!label) return state
      return {
        ...state,
        samples: { ...state.samples, [action.sampleId]: { ...sample, label } },
      }
    }

    case 'MOVE_SAMPLE': {
      const index = state.sampleOrder.indexOf(action.sampleId)
      const targetIndex = action.direction === 'up' ? index - 1 : index + 1
      if (index < 0 || targetIndex < 0 || targetIndex >= state.sampleOrder.length) return state
      const sampleOrder = state.sampleOrder.slice()
      const [moved] = sampleOrder.splice(index, 1)
      sampleOrder.splice(targetIndex, 0, moved!)
      return { ...state, sampleOrder }
    }

    case 'SET_ACTIVE_BANK':
      return state.banks.some((bank) => bank.id === action.bankId) ? { ...state, activeBankId: action.bankId } : state

    case 'APPLY_BANK_BUILDS': {
      let next: AppState = {
        ...state,
        key: action.key ?? state.key,
        mood: action.mood !== undefined ? action.mood : state.mood,
        padLayout: action.padLayout ?? state.padLayout,
      }
      const sampleMap = new Map<string, string>()
      const rowMoves = new Map<string, string>()
      for (const build of action.builds) {
        const kind = state.banks.find((bank) => bank.id === build.bankId)?.kind
        const keyShift =
          action.key && action.remap === 'index' && kind && kind !== 'drums'
            ? tonicMidi(kind, action.key.tonic) - tonicMidi(kind, state.key.tonic)
            : 0
        const applied = applyBankBuild(next, build, action.remap, keyShift)
        next = applied.state
        for (const [from, to] of applied.sampleMap) sampleMap.set(from, to)
        for (const [from, to] of applied.rowMoves) rowMoves.set(from, to)
      }
      if (sampleMap.size > 0 || rowMoves.size > 0) {
        // Steps store the exact sample they play, so programmed notes follow
        // their pads to the new key/sound/layout by swapping sample ids — and,
        // when a note lands on a different pad, by moving to that pad's row.
        next = { ...next, patterns: next.patterns.map((pattern) => remapPatternSteps(pattern, sampleMap, rowMoves)) }
      }
      return removeUnusedNoteSamples(next)
    }

    case 'SET_GROOVE':
      return { ...state, groove: action.groove }

    case 'START_PATTERN': {
      const stepCount = Math.min(MAX_STEP_COUNT, Math.max(MIN_STEP_COUNT, action.stepCount))
      return updatePattern(state, action.patternId, (pattern) => ({
        ...pattern,
        stepCount,
        steps: Object.fromEntries(Object.keys(pattern.steps).map((padId) => [padId, new Array<string | null>(stepCount).fill(null)])),
        traceSteps: null,
        traceSource: null,
      }))
    }

    case 'SET_PERFORM':
      return { ...state, perform: { ...state.perform, ...action.perform } }

    case 'SET_PAD_LABELS':
      return { ...state, padLabels: action.labels }

    case 'WRITE_BANK_PATTERN': {
      const bank = state.banks.find((item) => item.id === action.bankId)
      if (!bank) return state
      const bankPadIds = new Set(bank.padIds)
      const sampleByPad = new Map(state.pads.map((pad) => [pad.id, pad.sampleId]))
      return updatePattern(state, action.patternId, (pattern) => {
        const stepCount = Math.min(MAX_STEP_COUNT, Math.max(pattern.stepCount, action.minStepCount))
        const resize = (row: Array<string | null> | undefined) =>
          Array.from({ length: stepCount }, (_, i) => row?.[i] ?? null)
        const steps: Record<string, Array<string | null>> = {}
        for (const [padId, row] of Object.entries(pattern.steps)) {
          if (bankPadIds.has(padId)) continue
          steps[padId] = resize(row)
        }
        for (const [index, padId] of bank.padIds.entries()) {
          const active = new Set(index < bank.visibleCount ? action.stepsByPadIndex[index] ?? [] : [])
          const sampleId = sampleByPad.get(padId) ?? null
          steps[padId] = Array.from({ length: stepCount }, (_, i) => (active.has(i) ? sampleId : null))
        }
        return {
          ...pattern,
          stepCount,
          steps,
          traceSteps: pattern.traceSteps
            ? Object.fromEntries(Object.entries(pattern.traceSteps).map(([padId, row]) => [padId, resize(row)]))
            : null,
        }
      })
    }

    case 'ASSIGN_SAMPLE_TO_PAD':
      // Trim resets to the full sample — a trim window meaningful on the old
      // recording's waveform has no correct meaning on a different one. A
      // hand-picked sound isn't a generated note any more, so it loses its label.
      return updatePad(state, action.padId, (pad) => ({
        ...pad,
        sampleId: action.sampleId,
        trimStart: 0,
        trimEnd: 1,
        music: null,
      }))

    case 'SET_PAD_MUTED':
      return updatePad(state, action.padId, (pad) => ({ ...pad, muted: action.muted }))

    case 'SET_PAD_EFFECTS_BYPASSED':
      return updatePad(state, action.padId, (pad) => ({ ...pad, effectsBypassed: action.bypassed }))

    case 'SET_PAD_EFFECT':
      return updatePad(state, action.padId, (pad) => ({
        ...pad,
        effects: pad.effects.map((effect) =>
          effect.id === action.effectId ? { ...effect, value: clamp(action.value, EFFECT_MIN, EFFECT_MAX) } : effect,
        ),
      }))

    case 'RESET_PAD_EFFECTS':
      return updatePad(state, action.padId, (pad) => ({ ...pad, effects: createNeutralEffects() }))

    case 'APPLY_EFFECT_PRESET_TO_ALL_PADS': {
      const preset: CharacterPreset = { filter: action.filter, grit: action.grit, echo: action.echo, reverb: action.reverb }
      const { pads, bank } = updateActiveBankPads(state, (pad) => withCharacterEffects(pad, preset))
      return { ...state, pads, fxBySound: rememberBankCharacter(state, bank, preset) }
    }

    case 'SET_ALL_PADS_EFFECT': {
      const { pads, bank } = updateActiveBankPads(state, (pad) => ({
        ...pad,
        effects: pad.effects.map((effect) =>
          effect.id === action.effectId ? { ...effect, value: clamp(action.value, EFFECT_MIN, EFFECT_MAX) } : effect,
        ),
      }))
      const representative = pads.find((pad) => pad.id === bank.padIds[0])
      const valueOf = (id: EffectId) => representative?.effects.find((effect) => effect.id === id)?.value ?? 0
      const preset = Object.fromEntries(CHARACTER_IDS.map((id) => [id, valueOf(id)])) as unknown as CharacterPreset
      return { ...state, pads, fxBySound: rememberBankCharacter(state, bank, preset) }
    }

    case 'SET_ALL_PADS_EFFECTS_BYPASSED':
      return { ...state, pads: updateActiveBankPads(state, (pad) => ({ ...pad, effectsBypassed: action.bypassed })).pads }

    case 'RESET_ALL_PADS_EFFECTS': {
      const { pads, bank } = updateActiveBankPads(state, (pad) => ({ ...pad, effects: createNeutralEffects() }))
      return { ...state, pads, fxBySound: rememberBankCharacter(state, bank, null) }
    }

    case 'SET_PAD_TRIM': {
      // Keeps end at least MIN_TRIM_GAP after start; if that would push end past
      // 1, pulls start down instead of letting the window collapse to nothing.
      const end = clamp(action.trimEnd, MIN_TRIM_GAP, 1)
      const start = Math.min(clamp(action.trimStart, 0, 1), end - MIN_TRIM_GAP)
      return updatePad(state, action.padId, (pad) => ({ ...pad, trimStart: start, trimEnd: end }))
    }

    case 'SET_PAD_MIX_LEVEL':
      return updatePad(state, action.padId, (pad) => ({
        ...pad,
        mixLevel: clamp(action.level, MIX_LEVEL_MIN, MIX_LEVEL_MAX),
      }))

    case 'TOGGLE_STEP':
      return updatePattern(state, action.patternId, (pattern) => {
        const existing = pattern.steps[action.padId] ?? new Array<string | null>(pattern.stepCount).fill(null)
        const steps = existing.slice()
        // The sample id is captured when the cell is turned on. Swapping the
        // pad later only affects new steps; it never rewrites this sequence.
        const currentSampleId = steps[action.stepIndex]
        if (currentSampleId !== null) {
          steps[action.stepIndex] = null
        } else if (action.sampleId !== null) {
          steps[action.stepIndex] = action.sampleId
        }
        return { ...pattern, steps: { ...pattern.steps, [action.padId]: steps } }
      })

    case 'SET_STEP_SAMPLE': {
      const pattern = state.patterns.find((item) => item.id === action.patternId)
      if (!pattern || !state.samples[action.sampleId] || action.stepIndex < 0 || action.stepIndex >= pattern.stepCount) {
        return state
      }
      const existingSteps = pattern.steps[action.padId] ?? new Array<string | null>(pattern.stepCount).fill(null)
      return updatePattern(state, action.patternId, (current) => ({
        ...current,
        steps: {
          ...current.steps,
          [action.padId]: existingSteps.map((sampleId, stepIndex) =>
            stepIndex === action.stepIndex ? action.sampleId : sampleId,
          ),
        },
      }))
    }

    case 'CLEAR_PATTERN': {
      const cleared = updatePattern(state, action.patternId, (pattern) => ({
        ...pattern,
        steps: Object.fromEntries(
          Object.keys(pattern.steps).map((padId) => [padId, new Array<string | null>(pattern.stepCount).fill(null)]),
        ),
      }))
      return removeUnusedNoteSamples(cleared)
    }

    case 'REMOVE_PATTERN_STEPS':
      return updatePattern(state, action.patternId, (pattern) => {
        if (pattern.stepCount <= MIN_STEP_COUNT) return pattern
        const stepCount = Math.max(MIN_STEP_COUNT, pattern.stepCount - STEP_ADD_COUNT)
        return {
          ...pattern,
          stepCount,
          steps: Object.fromEntries(
            Object.entries(pattern.steps).map(([padId, steps]) => [padId, steps.slice(0, stepCount)]),
          ),
          traceSteps: pattern.traceSteps
            ? Object.fromEntries(
                Object.entries(pattern.traceSteps).map(([padId, steps]) => [padId, steps.slice(0, stepCount)]),
              )
            : null,
        }
      })

    case 'CAPTURE_PATTERN_TRACE':
      // Hiding preserves the exact programmed cells as a visual trace, then
      // clears only their live playback layer. It is reversible via restore.
      return updatePattern(state, action.patternId, (pattern) => ({
        ...pattern,
        traceSteps: Object.fromEntries(Object.entries(pattern.steps).map(([padId, steps]) => [padId, steps.slice()])),
        traceSource: 'hidden',
        steps: Object.fromEntries(
          Object.entries(pattern.steps).map(([padId, steps]) => [padId, new Array<string | null>(steps.length).fill(null)]),
        ),
      }))

    case 'RESTORE_PATTERN_TRACE':
      return updatePattern(state, action.patternId, (pattern) => {
        if (pattern.traceSource !== 'hidden' || !pattern.traceSteps) return pattern
        return { ...pattern, steps: pattern.traceSteps, traceSteps: null, traceSource: null }
      })

    case 'CLEAR_PATTERN_TRACE':
      return updatePattern(state, action.patternId, (pattern) => ({ ...pattern, traceSteps: null, traceSource: null }))

    case 'LOAD_SEQUENCE_TRACE': {
      // Each trace row goes back onto the pad it came from when that pad still
      // exists (traces record pad ids); otherwise — an older trace, or a pad
      // since removed — rows fill the Drums (sampler) bank's slots in order.
      const drums = getSamplerBank(state)
      const existingPadIds = new Set(state.pads.map((pad) => pad.id))
      const newPads: Pad[] = []
      const drumPadIds = drums.padIds.slice()
      let drumCursor = 0
      const rowPadIds: string[] = []
      for (let row = 0; row < action.trace.rows.length; row++) {
        const tracedId = action.trace.padIds?.[row]
        if (tracedId && existingPadIds.has(tracedId)) {
          rowPadIds.push(tracedId)
          continue
        }
        if (drumCursor >= MAX_PAD_COUNT) continue
        if (drumCursor >= drumPadIds.length) {
          const pad = createPad(drumPadIds.length)
          newPads.push(pad)
          drumPadIds.push(pad.id)
        }
        rowPadIds.push(drumPadIds[drumCursor]!)
        drumCursor++
      }
      const allPadIds = [...state.pads.map((pad) => pad.id), ...newPads.map((pad) => pad.id)]
      return {
        ...state,
        pads: [...state.pads, ...newPads],
        banks: state.banks.map((bank) =>
          bank.id === drums.id
            ? { ...bank, padIds: drumPadIds, visibleCount: Math.max(bank.visibleCount, drumCursor) }
            : bank,
        ),
        patterns: state.patterns.map((pattern) => {
          if (pattern.id !== action.patternId) return withEmptyRows([pattern], newPads.map((pad) => pad.id))[0]!
          // A real load: every cell whose sample still exists becomes a
          // live, playable step, replacing whatever the pattern held before
          // (this is loading a saved sequence, not overlaying one). A cell
          // whose sample has since been deleted can't play, so it falls
          // back to a visual-only ghost marker instead of silently
          // vanishing — see SequenceTrace.rows and resolveSequenceTraceCell.
          const stepCount = Math.min(MAX_STEP_COUNT, Math.max(pattern.stepCount, action.trace.stepCount))
          const empty = () => new Array<string | null>(stepCount).fill(null)
          const steps: Record<string, Array<string | null>> = Object.fromEntries(allPadIds.map((id) => [id, empty()]))
          const traceSteps: Record<string, Array<string | null>> = Object.fromEntries(allPadIds.map((id) => [id, empty()]))
          let hasMissingSample = false
          rowPadIds.forEach((padId, row) => {
            for (let stepIndex = 0; stepIndex < stepCount; stepIndex++) {
              const cell = resolveSequenceTraceCell(action.trace.rows[row]?.[stepIndex] ?? null, state.samples)
              steps[padId]![stepIndex] = cell.sampleId
              if (cell.missing) {
                hasMissingSample = true
                traceSteps[padId]![stepIndex] = action.markerSampleId
              }
            }
          })
          return {
            ...pattern,
            stepCount,
            steps,
            traceSteps: hasMissingSample ? traceSteps : null,
            traceSource: hasMissingSample ? 'reference' : null,
          }
        }),
      }
    }

    case 'ADD_PATTERN_STEPS':
      return updatePattern(state, action.patternId, (pattern) => {
        if (pattern.stepCount >= MAX_STEP_COUNT) return pattern
        const stepCount = Math.min(MAX_STEP_COUNT, pattern.stepCount + STEP_ADD_COUNT)
        return {
          ...pattern,
          stepCount,
          steps: Object.fromEntries(
            Object.entries(pattern.steps).map(([padId, steps]) => [
              padId,
              [...steps, ...new Array<string | null>(stepCount - pattern.stepCount).fill(null)],
            ]),
          ),
        }
      })

    case 'SET_VISIBLE_PAD_COUNT': {
      const bank = action.bankId ? state.banks.find((item) => item.id === action.bankId) : getActiveBank(state)
      if (!bank) return state
      const min = bank.kind === 'drums' ? MIN_PAD_COUNT : 0
      const count = Math.min(MAX_PAD_COUNT, Math.max(min, action.count))
      if (count <= bank.padIds.length) {
        // Shrinking is display-only: existing pad slots and their data are retained.
        return updateBank(state, bank.id, (item) => ({ ...item, visibleCount: count }))
      }
      // Growing past the slots this bank has ever had creates new, empty ones.
      const newPads = Array.from({ length: count - bank.padIds.length }, (_, i) => createPad(bank.padIds.length + i))
      const next = updateBank(state, bank.id, (item) => ({
        ...item,
        padIds: [...item.padIds, ...newPads.map((pad) => pad.id)],
        visibleCount: count,
      }))
      return { ...next, pads: [...next.pads, ...newPads], patterns: withEmptyRows(next.patterns, newPads.map((pad) => pad.id)) }
    }

    case 'REMOVE_PAD': {
      // A real deletion, not a display-only shrink: the pad slot is spliced out
      // of its bank and every later pad shifts up. Steps are keyed by pad id,
      // so no other pad's row is affected; only the removed pad's row goes.
      const bank = bankOfPad(state, action.padId)
      if (!bank) return state
      if (bank.kind === 'drums' && bank.padIds.length <= MIN_PAD_COUNT) return state
      const index = bank.padIds.indexOf(action.padId)
      const patterns = state.patterns.map((pattern) => {
        const { [action.padId]: _removedSteps, ...steps } = pattern.steps
        let traceSteps = pattern.traceSteps
        if (traceSteps && action.padId in traceSteps) {
          const { [action.padId]: _removedTrace, ...rest } = traceSteps
          traceSteps = rest
        }
        return { ...pattern, steps, traceSteps }
      })
      return {
        ...state,
        pads: state.pads.filter((pad) => pad.id !== action.padId),
        banks: state.banks.map((item) =>
          item.id === bank.id
            ? {
                ...item,
                padIds: item.padIds.filter((id) => id !== action.padId),
                visibleCount: index < item.visibleCount ? item.visibleCount - 1 : item.visibleCount,
              }
            : item,
        ),
        patterns,
      }
    }

    case 'SET_BPM':
      return { ...state, transport: { ...state.transport, bpm: clamp(action.bpm, BPM_MIN, BPM_MAX) } }

    case 'ADD_PATTERN': {
      const source = state.patterns.find((pattern) => pattern.id === action.copyFromId)
      const pattern: Pattern = {
        id: createId('pattern'),
        name: `Pattern ${state.patterns.length + 1}`,
        stepCount: source?.stepCount ?? 16,
        steps: Object.fromEntries(state.pads.map((pad) => [
          pad.id,
          source ? [...(source.steps[pad.id] ?? new Array<string | null>(source.stepCount).fill(null))] : new Array<string | null>(16).fill(null),
        ])),
        traceSteps: null,
        traceSource: null,
      }
      return { ...state, patterns: [...state.patterns, pattern], activePatternId: pattern.id }
    }

    case 'RENAME_PATTERN':
      return updatePattern(state, action.patternId, (pattern) => ({ ...pattern, name: action.name.slice(0, 40) }))

    case 'SET_ACTIVE_PATTERN':
      return state.patterns.some((pattern) => pattern.id === action.patternId)
        ? { ...state, activePatternId: action.patternId }
        : state

    case 'ADD_SONG_SECTION': {
      const section = { id: createId('section'), name: 'New section', patternId: state.activePatternId, repeats: 4 }
      const index = action.afterId ? state.songSections.findIndex((item) => item.id === action.afterId) : state.songSections.length - 1
      const songSections = [...state.songSections]
      songSections.splice(index + 1, 0, section)
      return { ...state, songSections }
    }

    case 'UPDATE_SONG_SECTION':
      return {
        ...state,
        songSections: state.songSections.map((section) => section.id !== action.sectionId ? section : {
          ...section,
          ...(action.name !== undefined ? { name: action.name.slice(0, 40) } : {}),
          ...(action.patternId !== undefined && state.patterns.some((pattern) => pattern.id === action.patternId) ? { patternId: action.patternId } : {}),
          ...(action.repeats !== undefined ? { repeats: clamp(Math.round(action.repeats), 1, 32) } : {}),
        }),
      }

    case 'DUPLICATE_SONG_SECTION': {
      const index = state.songSections.findIndex((section) => section.id === action.sectionId)
      if (index < 0) return state
      const songSections = [...state.songSections]
      songSections.splice(index + 1, 0, { ...songSections[index]!, id: createId('section') })
      return { ...state, songSections }
    }

    case 'MOVE_SONG_SECTION': {
      const index = state.songSections.findIndex((section) => section.id === action.sectionId)
      const nextIndex = index + action.direction
      if (index < 0 || nextIndex < 0 || nextIndex >= state.songSections.length) return state
      const songSections = [...state.songSections]
      ;[songSections[index], songSections[nextIndex]] = [songSections[nextIndex]!, songSections[index]!]
      return { ...state, songSections }
    }

    case 'REMOVE_SONG_SECTION': {
      const songSections = state.songSections.filter((section) => section.id !== action.sectionId)
      return {
        ...state,
        songSections,
        transport: songSections.length ? state.transport : { ...state.transport, playMode: 'pattern', currentSongSectionId: null },
      }
    }

    case 'SET_PLAY_MODE':
      return { ...state, transport: { ...state.transport, playMode: action.mode, currentSongSectionId: null } }

    case 'SET_CURRENT_SONG_SECTION':
      return state.transport.currentSongSectionId === action.sectionId ? state : {
        ...state,
        transport: { ...state.transport, currentSongSectionId: action.sectionId },
      }

    case 'SET_TRANSPORT_PLAYING':
      return { ...state, transport: { ...state.transport, isPlaying: action.isPlaying, currentSongSectionId: action.isPlaying ? state.transport.currentSongSectionId : null } }

    case 'SET_LOOP_MODE':
      return { ...state, transport: { ...state.transport, loopMode: action.loopMode } }

    case 'SET_METRONOME_ENABLED':
      return { ...state, transport: { ...state.transport, metronomeEnabled: action.enabled } }

    case 'SET_PAD_PLAYBACK_MODE':
      return { ...state, transport: { ...state.transport, padPlaybackMode: action.mode } }

    case 'SET_MASTER_VOLUME':
      return { ...state, transport: { ...state.transport, masterVolume: clamp(action.level, 0, 100) } }

    case 'SET_PAD_LOOP_MODE_ENABLED':
      // Loop and Mix both change what touching a pad means, so only one is on at a time.
      return {
        ...state,
        transport: {
          ...state.transport,
          padLoopModeEnabled: action.enabled,
          padMixerModeEnabled: action.enabled ? false : state.transport.padMixerModeEnabled,
        },
      }

    case 'SET_PAD_MIXER_MODE_ENABLED':
      return {
        ...state,
        transport: {
          ...state.transport,
          padMixerModeEnabled: action.enabled,
          padLoopModeEnabled: action.enabled ? false : state.transport.padLoopModeEnabled,
        },
      }

    case 'SET_PLAYTHROUGH_RECORDING_ENABLED':
      return { ...state, transport: { ...state.transport, playthroughRecordingEnabled: action.enabled } }

    case 'CLEAR_ALL':
      return createInitialState(getSamplerBank(state).visibleCount)

    case 'LOAD_PROJECT':
      // Autosaves from before global-volume / trigger-mode controls lack these
      // fields. Hydrate them to safe defaults instead of treating undefined as
      // a one-shot mode or an invalid gain.
      return {
        ...action.state,
        transport: {
          ...action.state.transport,
          masterVolume: action.state.transport.masterVolume ?? 100,
          padPlaybackMode: action.state.transport.padPlaybackMode ?? 'gate',
          playMode: action.state.transport.playMode ?? 'pattern',
          currentSongSectionId: null,
        },
        songSections: action.state.songSections ?? [],
      }

    default: {
      const exhaustiveCheck: never = action
      return exhaustiveCheck
    }
  }
}
