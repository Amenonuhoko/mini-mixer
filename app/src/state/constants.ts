export const DEFAULT_PAD_COUNT = 9
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

// Ordered by how often each gets reached for in practice: Volume is adjusted
// on nearly every pad (basic mix level), Speed/Pitch are the classic sample-
// flipping tools, Filter is a common tone-shaping move, and Grit/Echo are
// occasional "spice" character effects — least reached for of the six.
export const EFFECT_IDS = ['volume', 'speed', 'pitch', 'filter', 'grit', 'echo'] as const

/** Trim handles can't collapse closer than this (fraction of the sample's duration). */
export const MIN_TRIM_GAP = 0.02

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
