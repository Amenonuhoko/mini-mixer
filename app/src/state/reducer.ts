import {
  BPM_MIN,
  BPM_MAX,
  EFFECT_MAX,
  EFFECT_MIN,
  MIN_PAD_COUNT,
  MAX_PAD_COUNT,
  MAX_STEP_COUNT,
  STEP_ADD_COUNT,
  STEP_COUNT,
  MIN_TRIM_GAP,
  MIX_LEVEL_MAX,
  MIX_LEVEL_MIN,
} from './constants'
import { createInitialState, createNeutralEffects, createPad } from './defaults'
import type { AppState, EffectId, Instrument, InstrumentPadSnapshot, LoopMode, PadPlaybackMode, Pattern, Sample, SequenceTrace } from './types'

export type Action =
  | { type: 'ADD_SAMPLE'; sample: Sample }
  | { type: 'ADD_SAMPLE_TO_NEW_PAD'; sample: Sample }
  | { type: 'REMOVE_SAMPLE'; sampleId: string }
  | { type: 'RENAME_SAMPLE'; sampleId: string; label: string }
  | { type: 'MOVE_SAMPLE'; sampleId: string; direction: 'up' | 'down' }
  | { type: 'ADD_INSTRUMENT'; instrument: Instrument; keySamples: Sample[] }
  | { type: 'REMOVE_INSTRUMENT'; instrumentId: string }
  | { type: 'APPLY_INSTRUMENT_TO_PADS'; instrumentId: string }
  | { type: 'ASSIGN_SAMPLE_TO_PAD'; padId: string; sampleId: string | null }
  | { type: 'SET_PAD_MUTED'; padId: string; muted: boolean }
  | { type: 'SET_PAD_EFFECTS_BYPASSED'; padId: string; bypassed: boolean }
  | { type: 'SET_PAD_EFFECT'; padId: string; effectId: EffectId; value: number }
  | { type: 'RESET_PAD_EFFECTS'; padId: string }
  | {
      type: 'APPLY_EFFECT_PRESET_TO_ALL_PADS'
      filter: number
      grit: number
      echo: number
      reverb: number
    }
  | { type: 'SET_ALL_PADS_EFFECTS_BYPASSED'; bypassed: boolean }
  | { type: 'RESET_ALL_PADS_EFFECTS' }
  | { type: 'SET_PAD_TRIM'; padId: string; trimStart: number; trimEnd: number }
  | { type: 'SET_PAD_MIX_LEVEL'; padId: string; level: number }
  | { type: 'TOGGLE_STEP'; patternId: string; padId: string; stepIndex: number; sampleId: string | null }
  | { type: 'CLEAR_PATTERN'; patternId: string }
  | { type: 'ADD_PATTERN_STEPS'; patternId: string }
  | { type: 'REMOVE_PATTERN_STEPS'; patternId: string }
  | { type: 'CAPTURE_PATTERN_TRACE'; patternId: string }
  | { type: 'CLEAR_PATTERN_TRACE'; patternId: string }
  | { type: 'LOAD_SEQUENCE_TRACE'; patternId: string; trace: SequenceTrace; markerSampleId: string }
  | { type: 'SET_VISIBLE_PAD_COUNT'; count: number }
  | { type: 'SET_BPM'; bpm: number }
  | { type: 'SET_TRANSPORT_PLAYING'; isPlaying: boolean }
  | { type: 'SET_LOOP_MODE'; loopMode: LoopMode }
  | { type: 'SET_METRONOME_ENABLED'; enabled: boolean }
  | { type: 'SET_PAD_PLAYBACK_MODE'; mode: PadPlaybackMode }
  | { type: 'SET_MASTER_VOLUME'; level: number }
  | { type: 'SET_PAD_LOOP_MODE_ENABLED'; enabled: boolean }
  | { type: 'SET_PAD_INSTRUMENT_MODE_ENABLED'; enabled: boolean }
  | { type: 'SET_PAD_MIXER_MODE_ENABLED'; enabled: boolean }
  | { type: 'SET_PLAYTHROUGH_RECORDING_ENABLED'; enabled: boolean }
  | { type: 'SET_AUTO_INSTRUMENT_ID'; instrumentId: string | null; padSnapshot?: Record<string, InstrumentPadSnapshot> | null }
  | { type: 'SET_CURRENT_STEP'; stepIndex: number }
  | { type: 'CLEAR_ALL' }
  | { type: 'LOAD_PROJECT'; state: AppState }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function updatePad(
  state: AppState,
  padId: string,
  update: (pad: AppState['pads'][number]) => AppState['pads'][number],
): AppState {
  return {
    ...state,
    pads: state.pads.map((pad) => (pad.id === padId ? update(pad) : pad)),
  }
}

function updatePattern(
  state: AppState,
  patternId: string,
  update: (pattern: Pattern) => Pattern,
): AppState {
  return {
    ...state,
    patterns: state.patterns.map((pattern) =>
      pattern.id === patternId ? update(pattern) : pattern,
    ),
  }
}

/** Removes hidden generated keys once no instrument, pad, or sequencer cell needs them. */
function removeUnusedNoteSamples(state: AppState): AppState {
  const inUse = new Set<string>()
  for (const instrument of Object.values(state.instruments)) {
    for (const sampleId of instrument.keySampleIds) inUse.add(sampleId)
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

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ADD_SAMPLE':
      return {
        ...state,
        samples: { ...state.samples, [action.sample.id]: action.sample },
        sampleOrder: [...state.sampleOrder, action.sample.id],
      }

    case 'ADD_SAMPLE_TO_NEW_PAD': {
      if (state.visiblePadCount >= MAX_PAD_COUNT) return state
      const targetIndex = state.visiblePadCount
      const existingPad = state.pads[targetIndex]
      const newPad = existingPad ?? createPad(targetIndex)
      const pads = existingPad
        ? state.pads.map((pad, index) =>
            index === targetIndex ? { ...pad, sampleId: action.sample.id, trimStart: 0, trimEnd: 1 } : pad,
          )
        : [...state.pads, { ...newPad, sampleId: action.sample.id }]
      const patterns =
        existingPad
          ? state.patterns
          : state.patterns.map((pattern) => ({
              ...pattern,
              steps: {
                ...pattern.steps,
                [newPad.id]: new Array<string | null>(pattern.stepCount).fill(null),
              },
            }))
      return {
        ...state,
        samples: { ...state.samples, [action.sample.id]: action.sample },
        sampleOrder: [...state.sampleOrder, action.sample.id],
        pads,
        visiblePadCount: targetIndex + 1,
        patterns,
      }
    }

    case 'REMOVE_SAMPLE': {
      const { [action.sampleId]: _removed, ...remainingSamples } = state.samples
      return {
        ...state,
        samples: remainingSamples,
        sampleOrder: state.sampleOrder.filter((id) => id !== action.sampleId),
        pads: state.pads.map((pad) =>
          pad.sampleId === action.sampleId ? { ...pad, sampleId: null } : pad,
        ),
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

    case 'ADD_INSTRUMENT': {
      const keySamplesById = Object.fromEntries(action.keySamples.map((s) => [s.id, s]))
      return {
        ...state,
        samples: { ...state.samples, ...keySamplesById },
        sampleOrder: [...state.sampleOrder, ...action.keySamples.map((s) => s.id)],
        instruments: { ...state.instruments, [action.instrument.id]: action.instrument },
        instrumentOrder: [...state.instrumentOrder, action.instrument.id],
      }
    }

    case 'REMOVE_INSTRUMENT': {
      const instrument = state.instruments[action.instrumentId]
      if (!instrument) return state
      const keyIds = new Set(instrument.keySampleIds)
      // A sequencer cell is a historical reference. Keep an otherwise-transient
      // key sample available (but still hidden from the Library) while a pattern
      // needs it, even after its quick instrument layout has been dismissed.
      const referencedKeyIds = new Set(
        instrument.keySampleIds.filter((sampleId) =>
          state.patterns.some((pattern) =>
            Object.values(pattern.steps).some((steps) => steps.includes(sampleId)),
          ),
        ),
      )
      const removableKeyIds = new Set(
        instrument.keySampleIds.filter((sampleId) => !referencedKeyIds.has(sampleId)),
      )
      const remainingSamples = { ...state.samples }
      for (const id of removableKeyIds) delete remainingSamples[id]
      const { [action.instrumentId]: _removed, ...remainingInstruments } = state.instruments
      return {
        ...state,
        samples: remainingSamples,
        sampleOrder: state.sampleOrder.filter((id) => !removableKeyIds.has(id)),
        instruments: remainingInstruments,
        instrumentOrder: state.instrumentOrder.filter((id) => id !== action.instrumentId),
        pads: state.pads.map((pad) => {
          const snapshot =
            state.transport.autoInstrumentId === action.instrumentId
              ? state.transport.autoInstrumentPadSnapshot?.[pad.id]
              : undefined
          // A temporary instrument is an overlay on the user's layout, so
          // restore the original sound/trim before deleting generated keys.
          if (snapshot) return { ...pad, ...snapshot }
          return pad.sampleId && keyIds.has(pad.sampleId) ? { ...pad, sampleId: null } : pad
        }),
        transport:
          state.transport.autoInstrumentId === action.instrumentId
            ? { ...state.transport, autoInstrumentId: null, autoInstrumentPadSnapshot: null }
            : state.transport,
      }
    }

    case 'APPLY_INSTRUMENT_TO_PADS': {
      const instrument = state.instruments[action.instrumentId]
      if (!instrument) return state
      // An instrument is a keyboard layout, so the active grid follows its
      // actual key count rather than whatever pad count happened to be active
      // before it was selected. Existing pad slots are preserved; only missing
      // slots are appended with normal empty-pad/default-pattern state.
      const targetCount = instrument.keySampleIds.length
      const newPads =
        targetCount > state.pads.length
          ? Array.from({ length: targetCount - state.pads.length }, (_, i) =>
              createPad(state.pads.length + i),
            )
          : []
      const pads = [...state.pads, ...newPads].map((pad, index) => {
        if (index >= targetCount) return pad
        const keySampleId = instrument.keySampleIds[index]
        return keySampleId ? { ...pad, sampleId: keySampleId, trimStart: 0, trimEnd: 1 } : pad
      })
      return {
        ...state,
        pads,
        visiblePadCount: targetCount,
        patterns:
          newPads.length === 0
            ? state.patterns
            : state.patterns.map((pattern) => ({
                ...pattern,
                steps: {
                  ...pattern.steps,
                  ...Object.fromEntries(
                    newPads.map((pad) => [pad.id, new Array<string | null>(pattern.stepCount).fill(null)]),
                  ),
                },
              })),
      }
    }

    case 'ASSIGN_SAMPLE_TO_PAD':
      // Trim resets to the full sample — a trim window meaningful on the old
      // recording's waveform has no correct meaning on a different one.
      return updatePad(state, action.padId, (pad) => ({
        ...pad,
        sampleId: action.sampleId,
        trimStart: 0,
        trimEnd: 1,
      }))

    case 'SET_PAD_MUTED':
      return updatePad(state, action.padId, (pad) => ({ ...pad, muted: action.muted }))

    case 'SET_PAD_EFFECTS_BYPASSED':
      return updatePad(state, action.padId, (pad) => ({
        ...pad,
        effectsBypassed: action.bypassed,
      }))

    case 'SET_PAD_EFFECT':
      return updatePad(state, action.padId, (pad) => ({
        ...pad,
        effects: pad.effects.map((effect) =>
          effect.id === action.effectId
            ? { ...effect, value: clamp(action.value, EFFECT_MIN, EFFECT_MAX) }
            : effect,
        ),
      }))

    case 'RESET_PAD_EFFECTS':
      return updatePad(state, action.padId, (pad) => ({ ...pad, effects: createNeutralEffects() }))

    case 'APPLY_EFFECT_PRESET_TO_ALL_PADS':
      return {
        ...state,
        pads: state.pads.map((pad, index) => {
          if (index >= state.visiblePadCount) return pad
          return {
            ...pad,
            effects: pad.effects.map((effect) =>
              effect.id === 'filter' ||
              effect.id === 'grit' ||
              effect.id === 'echo' ||
              effect.id === 'reverb'
                ? { ...effect, value: action[effect.id] }
                : effect,
            ),
          }
        }),
      }

    case 'SET_ALL_PADS_EFFECTS_BYPASSED':
      return {
        ...state,
        pads: state.pads.map((pad, index) =>
          index >= state.visiblePadCount ? pad : { ...pad, effectsBypassed: action.bypassed },
        ),
      }

    case 'RESET_ALL_PADS_EFFECTS':
      return {
        ...state,
        pads: state.pads.map((pad, index) =>
          index >= state.visiblePadCount ? pad : { ...pad, effects: createNeutralEffects() },
        ),
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
        if (pattern.stepCount <= STEP_COUNT) return pattern
        const stepCount = Math.max(STEP_COUNT, pattern.stepCount - STEP_ADD_COUNT)
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
      return updatePattern(state, action.patternId, (pattern) => ({
        ...pattern,
        traceSteps: Object.fromEntries(
          Object.entries(pattern.steps).map(([padId, steps]) => [padId, steps.slice()]),
        ),
      }))

    case 'CLEAR_PATTERN_TRACE':
      return updatePattern(state, action.patternId, (pattern) => ({ ...pattern, traceSteps: null }))

    case 'LOAD_SEQUENCE_TRACE': {
      const targetPadCount = Math.min(MAX_PAD_COUNT, Math.max(state.visiblePadCount, action.trace.rows.length))
      const newPads = Array.from(
        { length: Math.max(0, targetPadCount - state.pads.length) },
        (_, index) => createPad(state.pads.length + index),
      )
      const pads = [...state.pads, ...newPads]
      return {
        ...state,
        pads,
        visiblePadCount: targetPadCount,
        patterns: state.patterns.map((pattern) => {
          if (pattern.id !== action.patternId) {
            if (newPads.length === 0) return pattern
            return {
              ...pattern,
              steps: {
                ...pattern.steps,
                ...Object.fromEntries(
                  newPads.map((pad) => [pad.id, new Array<string | null>(pattern.stepCount).fill(null)]),
                ),
              },
            }
          }
          const stepCount = Math.min(MAX_STEP_COUNT, Math.max(pattern.stepCount, action.trace.stepCount))
          return {
            ...pattern,
            stepCount,
            steps: Object.fromEntries(
              pads.map((pad) => [
                pad.id,
                Array.from({ length: stepCount }, (_, index) => pattern.steps[pad.id]?.[index] ?? null),
              ]),
            ),
            traceSteps: Object.fromEntries(
              pads.map((pad, rowIndex) => [
                pad.id,
                Array.from({ length: stepCount }, (_, stepIndex) =>
                  action.trace.rows[rowIndex]?.[stepIndex] ? action.markerSampleId : null,
                ),
              ]),
            ),
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
      const count = Math.min(MAX_PAD_COUNT, Math.max(MIN_PAD_COUNT, action.count))
      if (count <= state.pads.length) {
        // Shrinking is display-only: existing pad slots and their data are retained,
        // not truncated from `pads`. Visibility is derived at read-time from this count.
        return { ...state, visiblePadCount: count }
      }
      // Growing past the number of pad slots that have ever existed creates new ones.
      const newPads = Array.from({ length: count - state.pads.length }, (_, i) =>
        createPad(state.pads.length + i),
      )
      const newPadIds = newPads.map((pad) => pad.id)
      return {
        ...state,
        pads: [...state.pads, ...newPads],
        visiblePadCount: count,
        patterns: state.patterns.map((pattern) => ({
          ...pattern,
          steps: {
            ...pattern.steps,
            ...Object.fromEntries(
              newPadIds.map((id) => [id, new Array<string | null>(pattern.stepCount).fill(null)]),
            ),
          },
        })),
      }
    }

    case 'SET_BPM':
      return {
        ...state,
        transport: { ...state.transport, bpm: clamp(action.bpm, BPM_MIN, BPM_MAX) },
      }

    case 'SET_TRANSPORT_PLAYING':
      return { ...state, transport: { ...state.transport, isPlaying: action.isPlaying } }

    case 'SET_LOOP_MODE':
      return { ...state, transport: { ...state.transport, loopMode: action.loopMode } }

    case 'SET_METRONOME_ENABLED':
      return { ...state, transport: { ...state.transport, metronomeEnabled: action.enabled } }

    case 'SET_PAD_PLAYBACK_MODE':
      return { ...state, transport: { ...state.transport, padPlaybackMode: action.mode } }

    case 'SET_MASTER_VOLUME':
      return {
        ...state,
        transport: { ...state.transport, masterVolume: clamp(action.level, 0, 100) },
      }

    case 'SET_PAD_LOOP_MODE_ENABLED':
      // Mutually exclusive with instrument mode and mixer mode — all three change
      // what interacting with a pad means for the grid as a whole, so having more
      // than one on at once would be ambiguous.
      return {
        ...state,
        transport: {
          ...state.transport,
          padLoopModeEnabled: action.enabled,
          padInstrumentModeEnabled: action.enabled ? false : state.transport.padInstrumentModeEnabled,
          padMixerModeEnabled: action.enabled ? false : state.transport.padMixerModeEnabled,
        },
      }

    case 'SET_PAD_INSTRUMENT_MODE_ENABLED':
      return {
        ...state,
        transport: {
          ...state.transport,
          padInstrumentModeEnabled: action.enabled,
          padLoopModeEnabled: action.enabled ? false : state.transport.padLoopModeEnabled,
          padMixerModeEnabled: action.enabled ? false : state.transport.padMixerModeEnabled,
        },
      }

    case 'SET_PAD_MIXER_MODE_ENABLED':
      return {
        ...state,
        transport: {
          ...state.transport,
          padMixerModeEnabled: action.enabled,
          // Mixer is an overlay for changing pad levels, not a replacement for
          // the selected instrument. Keep Instrument Mode selected underneath
          // it so closing Mixer returns to the same playable instrument layout.
          padInstrumentModeEnabled: state.transport.padInstrumentModeEnabled,
          padLoopModeEnabled: action.enabled ? false : state.transport.padLoopModeEnabled,
        },
      }

    case 'SET_PLAYTHROUGH_RECORDING_ENABLED':
      return {
        ...state,
        transport: { ...state.transport, playthroughRecordingEnabled: action.enabled },
      }

    case 'SET_AUTO_INSTRUMENT_ID':
      return {
        ...state,
        transport: {
          ...state.transport,
          autoInstrumentId: action.instrumentId,
          autoInstrumentPadSnapshot: action.instrumentId ? (action.padSnapshot ?? null) : null,
        },
      }

    case 'SET_CURRENT_STEP':
      return { ...state, transport: { ...state.transport, currentStep: action.stepIndex } }

    case 'CLEAR_ALL':
      return createInitialState(state.visiblePadCount)

    case 'LOAD_PROJECT':
      // Autosaves from before global-volume / trigger-mode controls lack these
      // fields. Hydrate them to safe defaults instead of treating undefined as
      // a one-shot mode or an invalid gain.
      return {
        ...action.state,
        visiblePadCount: Math.min(MAX_PAD_COUNT, Math.max(MIN_PAD_COUNT, action.state.visiblePadCount)),
        transport: {
          ...action.state.transport,
          masterVolume: action.state.transport.masterVolume ?? 100,
          padPlaybackMode: action.state.transport.padPlaybackMode ?? 'gate',
        },
      }

    default: {
      const exhaustiveCheck: never = action
      return exhaustiveCheck
    }
  }
}
