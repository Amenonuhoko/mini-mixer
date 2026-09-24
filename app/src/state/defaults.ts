import {
  DEFAULT_BPM,
  DEFAULT_MIX_LEVEL,
  DEFAULT_PAD_COUNT,
  EFFECT_IDS,
  NEUTRAL_EFFECT_VALUE,
  PAD_COLOR_PALETTE,
  STEP_COUNT,
} from './constants'
import { DEFAULT_KEY, DEFAULT_PAD_LABELS } from '../music/theory'
import { BANK_KINDS, createBank } from './banks'
import type { AppState, EffectSetting, Pad, Pattern, PerformSettings } from './types'

export const DEFAULT_PERFORM: PerformSettings = {
  mode: 'off',
  rate: '1/16',
  arpPattern: 'up',
  arpOctaves: 1,
  latch: false,
  strum: 'off',
  strumSpeed: 'medium',
}

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
    effects: createNeutralEffects(),
    effectsBypassed: false,
    mixLevel: DEFAULT_MIX_LEVEL,
    music: null,
  }
}

export function createEmptySteps(padIds: string[]): Record<string, Array<string | null>> {
  const steps: Record<string, Array<string | null>> = {}
  for (const padId of padIds) {
    steps[padId] = new Array<string | null>(STEP_COUNT).fill(null)
  }
  return steps
}

export function createDefaultPattern(padIds: string[]): Pattern {
  return {
    id: createId('pattern'),
    name: 'Pattern 1',
    stepCount: STEP_COUNT,
    steps: createEmptySteps(padIds),
    traceSteps: null,
    traceSource: null,
  }
}

/**
 * A fresh project: a Drums bank of empty pads ready for recordings or a kit,
 * and empty Bass/Chords/Melody banks waiting for a sound, in the Bright mood's
 * key. `padCount` sizes the Drums bank.
 */
export function createInitialState(padCount: number = DEFAULT_PAD_COUNT): AppState {
  const pads = Array.from({ length: padCount }, (_, index) => createPad(index))
  const pattern = createDefaultPattern(pads.map((pad) => pad.id))
  const banks = BANK_KINDS.map((kind) =>
    createBank(createId('bank'), kind, kind === 'drums' ? pads.map((pad) => pad.id) : []),
  )

  return {
    samples: {},
    sampleOrder: [],
    pads,
    banks,
    activeBankId: banks[0]!.id,
    key: DEFAULT_KEY,
    mood: 'bright',
    padLayout: 'guided',
    padLabels: DEFAULT_PAD_LABELS,
    perform: DEFAULT_PERFORM,
    fxBySound: {},
    patterns: [pattern],
    activePatternId: pattern.id,
    transport: {
      bpm: DEFAULT_BPM,
      isPlaying: false,
      loopMode: 'continuous',
      currentStep: 0,
      metronomeEnabled: false,
      padPlaybackMode: 'gate',
      masterVolume: 100,
      padLoopModeEnabled: false,
      padMixerModeEnabled: false,
      playthroughRecordingEnabled: false,
    },
  }
}
