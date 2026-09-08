import {
  BPM_MIN,
  BPM_MAX,
  EFFECT_MAX,
  EFFECT_MIN,
  MIN_PAD_COUNT,
  MIN_TRIM_GAP,
  MIX_LEVEL_MAX,
  MIX_LEVEL_MIN,
  STEP_COUNT,
} from './constants'
import { createInitialState, createNeutralEffects, createPad } from './defaults'
import type { AppState, EffectId, Instrument, InstrumentPadSnapshot, LoopMode, Pattern, Sample } from './types'

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
  | { type: 'TOGGLE_STEP'; patternId: string; padId: string; stepIndex: number }
  | { type: 'CLEAR_PATTERN'; patternId: string }
  | { type: 'SET_VISIBLE_PAD_COUNT'; count: number }
  | { type: 'SET_BPM'; bpm: number }
  | { type: 'SET_TRANSPORT_PLAYING'; isPlaying: boolean }
  | { type: 'SET_LOOP_MODE'; loopMode: LoopMode }
  | { type: 'SET_METRONOME_ENABLED'; enabled: boolean }
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
                    newPads.map((pad) => [pad.id, new Array<boolean>(STEP_COUNT).fill(false)]),
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
        const existing = pattern.steps[action.padId] ?? new Array<boolean>(STEP_COUNT).fill(false)
        const steps = existing.slice()
        steps[action.stepIndex] = !steps[action.stepIndex]
        return { ...pattern, steps: { ...pattern.steps, [action.padId]: steps } }
      })

    case 'CLEAR_PATTERN':
      return updatePattern(state, action.patternId, (pattern) => ({
        ...pattern,
        steps: Object.fromEntries(
          Object.keys(pattern.steps).map((padId) => [padId, new Array<boolean>(STEP_COUNT).fill(false)]),
        ),
      }))

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
      return action.state

    default: {
      const exhaustiveCheck: never = action
      return exhaustiveCheck
    }
  }
}
