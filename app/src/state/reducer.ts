import {
  BPM_MIN,
  BPM_MAX,
  EFFECT_MAX,
  EFFECT_MIN,
  MIN_PAD_COUNT,
  MIN_TRIM_GAP,
  STEP_COUNT,
} from './constants'
import { createInitialState, createNeutralEffects, createPad } from './defaults'
import type { AppState, EffectId, Instrument, LoopMode, Pattern, Sample } from './types'

export type Action =
  | { type: 'ADD_SAMPLE'; sample: Sample }
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
  | { type: 'SET_PAD_TRIM'; padId: string; trimStart: number; trimEnd: number }
  | { type: 'TOGGLE_STEP'; patternId: string; padId: string; stepIndex: number }
  | { type: 'SET_VISIBLE_PAD_COUNT'; count: number }
  | { type: 'SET_BPM'; bpm: number }
  | { type: 'SET_TRANSPORT_PLAYING'; isPlaying: boolean }
  | { type: 'SET_LOOP_MODE'; loopMode: LoopMode }
  | { type: 'SET_METRONOME_ENABLED'; enabled: boolean }
  | { type: 'SET_PAD_LOOP_MODE_ENABLED'; enabled: boolean }
  | { type: 'SET_PAD_INSTRUMENT_MODE_ENABLED'; enabled: boolean }
  | { type: 'SET_PLAYTHROUGH_RECORDING_ENABLED'; enabled: boolean }
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

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ADD_SAMPLE':
      return {
        ...state,
        samples: { ...state.samples, [action.sample.id]: action.sample },
        sampleOrder: [...state.sampleOrder, action.sample.id],
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
      const remainingSamples = { ...state.samples }
      for (const id of instrument.keySampleIds) delete remainingSamples[id]
      const { [action.instrumentId]: _removed, ...remainingInstruments } = state.instruments
      return {
        ...state,
        samples: remainingSamples,
        sampleOrder: state.sampleOrder.filter((id) => !keyIds.has(id)),
        instruments: remainingInstruments,
        instrumentOrder: state.instrumentOrder.filter((id) => id !== action.instrumentId),
        pads: state.pads.map((pad) =>
          pad.sampleId && keyIds.has(pad.sampleId) ? { ...pad, sampleId: null } : pad,
        ),
      }
    }

    case 'APPLY_INSTRUMENT_TO_PADS': {
      const instrument = state.instruments[action.instrumentId]
      if (!instrument) return state
      return {
        ...state,
        pads: state.pads.map((pad, index) => {
          if (index >= state.visiblePadCount) return pad
          const keySampleId = instrument.keySampleIds[index]
          if (!keySampleId) return pad
          return { ...pad, sampleId: keySampleId, trimStart: 0, trimEnd: 1 }
        }),
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

    case 'SET_PAD_TRIM': {
      // Keeps end at least MIN_TRIM_GAP after start; if that would push end past
      // 1, pulls start down instead of letting the window collapse to nothing.
      const end = clamp(action.trimEnd, MIN_TRIM_GAP, 1)
      const start = Math.min(clamp(action.trimStart, 0, 1), end - MIN_TRIM_GAP)
      return updatePad(state, action.padId, (pad) => ({ ...pad, trimStart: start, trimEnd: end }))
    }

    case 'TOGGLE_STEP':
      return updatePattern(state, action.patternId, (pattern) => {
        const existing = pattern.steps[action.padId] ?? new Array<boolean>(STEP_COUNT).fill(false)
        const steps = existing.slice()
        steps[action.stepIndex] = !steps[action.stepIndex]
        return { ...pattern, steps: { ...pattern.steps, [action.padId]: steps } }
      })

    case 'SET_VISIBLE_PAD_COUNT': {
      const count = Math.max(MIN_PAD_COUNT, action.count)
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
              newPadIds.map((id) => [id, new Array<boolean>(STEP_COUNT).fill(false)]),
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

    case 'SET_PAD_LOOP_MODE_ENABLED':
      // Mutually exclusive with instrument mode — both change what tapping a pad
      // means for the grid as a whole, so having both on at once would be ambiguous.
      return {
        ...state,
        transport: {
          ...state.transport,
          padLoopModeEnabled: action.enabled,
          padInstrumentModeEnabled: action.enabled ? false : state.transport.padInstrumentModeEnabled,
        },
      }

    case 'SET_PAD_INSTRUMENT_MODE_ENABLED':
      return {
        ...state,
        transport: {
          ...state.transport,
          padInstrumentModeEnabled: action.enabled,
          padLoopModeEnabled: action.enabled ? false : state.transport.padLoopModeEnabled,
        },
      }

    case 'SET_PLAYTHROUGH_RECORDING_ENABLED':
      return {
        ...state,
        transport: { ...state.transport, playthroughRecordingEnabled: action.enabled },
      }

    case 'SET_CURRENT_STEP':
      return { ...state, transport: { ...state.transport, currentStep: action.stepIndex } }

    case 'CLEAR_ALL':
      return createInitialState(state.visiblePadCount)

    case 'LOAD_PROJECT':
      return action.state

    default: {
      const exhaustiveCheck: never = action
      return exhaustiveCheck
    }
  }
}
