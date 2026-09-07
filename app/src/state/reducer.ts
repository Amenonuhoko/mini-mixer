import { BPM_MIN, BPM_MAX, STEP_COUNT } from './constants'
import { createInitialState, createNeutralEffects, createPad } from './defaults'
import type { AppState, EffectId, LoopMode, Pattern, Sample } from './types'

export type Action =
  | { type: 'ADD_SAMPLE'; sample: Sample }
  | { type: 'REMOVE_SAMPLE'; sampleId: string }
  | { type: 'ASSIGN_SAMPLE_TO_PAD'; padId: string; sampleId: string | null }
  | { type: 'SET_PAD_LOOP'; padId: string; loop: boolean }
  | { type: 'SET_PAD_EFFECT'; padId: string; effectId: EffectId; value: number }
  | { type: 'RESET_PAD_EFFECTS'; padId: string }
  | { type: 'TOGGLE_STEP'; patternId: string; padId: string; stepIndex: number }
  | { type: 'SET_VISIBLE_PAD_COUNT'; count: number }
  | { type: 'SET_BPM'; bpm: number }
  | { type: 'SET_TRANSPORT_PLAYING'; isPlaying: boolean }
  | { type: 'SET_LOOP_MODE'; loopMode: LoopMode }
  | { type: 'SET_CURRENT_STEP'; stepIndex: number }
  | { type: 'CLEAR_ALL' }

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
      }

    case 'REMOVE_SAMPLE': {
      const { [action.sampleId]: _removed, ...remainingSamples } = state.samples
      return {
        ...state,
        samples: remainingSamples,
        pads: state.pads.map((pad) =>
          pad.sampleId === action.sampleId ? { ...pad, sampleId: null } : pad,
        ),
      }
    }

    case 'ASSIGN_SAMPLE_TO_PAD':
      return updatePad(state, action.padId, (pad) => ({ ...pad, sampleId: action.sampleId }))

    case 'SET_PAD_LOOP':
      return updatePad(state, action.padId, (pad) => ({ ...pad, loop: action.loop }))

    case 'SET_PAD_EFFECT':
      return updatePad(state, action.padId, (pad) => ({
        ...pad,
        effects: pad.effects.map((effect) =>
          effect.id === action.effectId
            ? { ...effect, value: clamp(action.value, 0, 100) }
            : effect,
        ),
      }))

    case 'RESET_PAD_EFFECTS':
      return updatePad(state, action.padId, (pad) => ({ ...pad, effects: createNeutralEffects() }))

    case 'TOGGLE_STEP':
      return updatePattern(state, action.patternId, (pattern) => {
        const existing = pattern.steps[action.padId] ?? new Array<boolean>(STEP_COUNT).fill(false)
        const steps = existing.slice()
        steps[action.stepIndex] = !steps[action.stepIndex]
        return { ...pattern, steps: { ...pattern.steps, [action.padId]: steps } }
      })

    case 'SET_VISIBLE_PAD_COUNT': {
      const count = Math.max(1, action.count)
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

    case 'SET_CURRENT_STEP':
      return { ...state, transport: { ...state.transport, currentStep: action.stepIndex } }

    case 'CLEAR_ALL':
      return createInitialState(state.visiblePadCount)

    default: {
      const exhaustiveCheck: never = action
      return exhaustiveCheck
    }
  }
}
