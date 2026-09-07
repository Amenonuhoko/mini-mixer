export const DEFAULT_PAD_COUNT = 8
export const MIN_PAD_COUNT = 1
export const MAX_PAD_COUNT = 16
export const STEP_COUNT = 16
export const BPM_MIN = 40
export const BPM_MAX = 240
export const DEFAULT_BPM = 120

/**
 * Dial range is bipolar: -100 (full one way) .. 0 (neutral, no change) .. +100
 * (full the other way) — not 0-100 with 50 as an implicit "no change" midpoint,
 * which reads as "50% speed" rather than "no change."
 */
export const EFFECT_MIN = -100
export const EFFECT_MAX = 100
export const NEUTRAL_EFFECT_VALUE = 0
/** Dials snap to these increments (drag to 76 -> lands on 75). */
export const EFFECT_STEP = 25

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
