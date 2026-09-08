export const DEFAULT_PAD_COUNT = 9
export const MIN_PAD_COUNT = 1
export const MAX_PAD_COUNT = 32
/** One key per pad slot up to the max pad count, so applying an instrument to the grid never runs short regardless of the current pad count. */
export const INSTRUMENT_KEY_COUNT = MAX_PAD_COUNT
export const STEP_COUNT = 16
/** Patterns may shrink in four-step groups to this one-beat minimum. */
export const MIN_STEP_COUNT = 4
/** A pattern can grow in groups of four beats up to four bars. */
export const MAX_STEP_COUNT = 64
export const STEP_ADD_COUNT = 4
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
// flipping tools, Filter is a common tone-shaping move, Pan is a quick
// spatial-placement tool reached about as often, and Grit/Echo/Reverb are
// occasional "spice"/space character effects — Reverb the most occasional of
// all, since it's the most transformative of the eight.
export const EFFECT_IDS = ['volume', 'speed', 'pitch', 'filter', 'pan', 'grit', 'echo', 'reverb'] as const

/**
 * Quick-start combos across Filter/Grit/Echo/Reverb — the four "character"
 * dials — so you don't have to hand-dial four sliders to get somewhere
 * interesting. Applying one only touches these four; Pitch/Speed/Volume/Pan
 * are left alone (Pan especially — a preset is about acoustic character, not
 * stereo position). All values land on the same 25-point anchors the dials
 * themselves snap to.
 */
export interface EffectPreset {
  name: string
  filter: number
  grit: number
  echo: number
  reverb: number
}

export const EFFECT_PRESETS: EffectPreset[] = [
  { name: 'Telephone', filter: 75, grit: -25, echo: 0, reverb: 0 },
  { name: 'Underwater', filter: -75, grit: 0, echo: 50, reverb: 25 },
  { name: 'Vinyl', filter: -25, grit: -50, echo: -25, reverb: 0 },
  { name: 'Cavern', filter: -50, grit: 0, echo: 100, reverb: 100 },
  { name: 'Radio', filter: 60, grit: -15, echo: -20, reverb: 0 },
  { name: 'Lo-Fi', filter: -30, grit: -60, echo: 0, reverb: 10 },
  { name: 'Crunch', filter: 25, grit: 75, echo: 0, reverb: 0 },
  { name: 'Slapback', filter: 0, grit: 0, echo: -75, reverb: 0 },
  { name: 'Clean Air', filter: 25, grit: 0, echo: 0, reverb: 15 },
  { name: 'Warm Tape', filter: -25, grit: -25, echo: -25, reverb: 10 },
  { name: 'Wide Hall', filter: 0, grit: 0, echo: 25, reverb: 75 },
  { name: 'Dub', filter: -25, grit: 0, echo: 75, reverb: 25 },
  { name: 'Bitcrush', filter: 25, grit: 100, echo: 0, reverb: 0 },
  { name: 'Dream', filter: -25, grit: 0, echo: 25, reverb: 100 },
  { name: 'Ice', filter: 100, grit: 0, echo: 25, reverb: 50 },
  { name: 'Tunnel', filter: -100, grit: 50, echo: -25, reverb: -25 },
]

/** Trim handles can't collapse closer than this (fraction of the sample's duration). */
export const MIN_TRIM_GAP = 0.02

/** Pad.mixLevel range — 0 (silent) to 100 (unity/full), a plain fader, not bipolar like the effect dials. */
export const MIX_LEVEL_MIN = 0
export const MIX_LEVEL_MAX = 100
export const DEFAULT_MIX_LEVEL = 100

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
