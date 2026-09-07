import {
  DEFAULT_BPM,
  DEFAULT_PAD_COUNT,
  EFFECT_IDS,
  NEUTRAL_EFFECT_VALUE,
  PAD_COLOR_PALETTE,
  STEP_COUNT,
} from './constants'
import type { AppState, EffectSetting, Pad, Pattern } from './types'

export function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

/** Thin wrapper so `Date.now()` — impure — isn't called directly from component bodies. */
export function timestampNow(): number {
  return Date.now()
}

export function createNeutralEffects(): EffectSetting[] {
  return EFFECT_IDS.map((id) => ({ id, value: NEUTRAL_EFFECT_VALUE }))
}

export function createPad(index: number): Pad {
  return {
    id: createId('pad'),
    sampleId: null,
    muted: false,
    trimStart: 0,
    trimEnd: 1,
    // Modulo guarantees this index is in bounds; the palette is a fixed, non-empty array.
    color: PAD_COLOR_PALETTE[index % PAD_COLOR_PALETTE.length]!,
    icon: String(index + 1),
    effects: createNeutralEffects(),
  }
}

export function createEmptySteps(padIds: string[]): Record<string, boolean[]> {
  const steps: Record<string, boolean[]> = {}
  for (const padId of padIds) {
    steps[padId] = new Array<boolean>(STEP_COUNT).fill(false)
  }
  return steps
}

export function createDefaultPattern(padIds: string[]): Pattern {
  return {
    id: createId('pattern'),
    name: 'Pattern 1',
    steps: createEmptySteps(padIds),
  }
}

export function createInitialState(padCount: number = DEFAULT_PAD_COUNT): AppState {
  const pads = Array.from({ length: padCount }, (_, index) => createPad(index))
  const pattern = createDefaultPattern(pads.map((pad) => pad.id))

  return {
    samples: {},
    sampleOrder: [],
    pads,
    visiblePadCount: padCount,
    patterns: [pattern],
    activePatternId: pattern.id,
    transport: {
      bpm: DEFAULT_BPM,
      isPlaying: false,
      loopMode: 'continuous',
      currentStep: 0,
      metronomeEnabled: false,
      padLoopModeEnabled: false,
    },
  }
}
