export const DEFAULT_PAD_COUNT = 8
export const STEP_COUNT = 16
export const BPM_MIN = 40
export const BPM_MAX = 240
export const DEFAULT_BPM = 120
/** Neutral dial position — 50% means "no change" for every effect. */
export const NEUTRAL_EFFECT_VALUE = 50

export const EFFECT_IDS = ['pitch', 'speed', 'filter'] as const

/** Cycled through as pads are created, so each pad gets a stable, distinct identity. */
export const PAD_COLOR_PALETTE = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
]
