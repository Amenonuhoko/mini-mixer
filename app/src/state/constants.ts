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
  description?: string
  group?: 'Tone' | 'Space' | 'Texture'
  filter: number
  grit: number
  echo: number
  reverb: number
}

export const EFFECT_PRESETS: EffectPreset[] = [
  { name: 'Clean', group: 'Tone', description: 'Original sound, no coloration', filter: 0, grit: 0, echo: 0, reverb: 0 },
  { name: 'Warm Tape', group: 'Tone', description: 'Soft highs and gentle saturation', filter: -25, grit: 15, echo: 0, reverb: 0 },
  { name: 'Radio', group: 'Tone', description: 'Thin, gritty speaker tone', filter: 80, grit: 25, echo: 0, reverb: 0 },
  { name: 'Underwater', group: 'Tone', description: 'Deeply muffled with drifting repeats', filter: -85, grit: 0, echo: 35, reverb: 20 },
  { name: 'Air', group: 'Tone', description: 'Light low cut and a small room', filter: 25, grit: 0, echo: 0, reverb: -25 },
  { name: 'Small Room', group: 'Space', description: 'A close, dry studio space', filter: 0, grit: 0, echo: 0, reverb: -55 },
  { name: 'Slapback', group: 'Space', description: 'A quick rockabilly double', filter: 0, grit: 0, echo: -80, reverb: 0 },
  { name: 'Wide Hall', group: 'Space', description: 'Clear notes with a long stereo tail', filter: 0, grit: 0, echo: 0, reverb: 65 },
  { name: 'Dream', group: 'Space', description: 'Soft focus and a spacious wash', filter: -40, grit: 0, echo: 30, reverb: 100 },
  { name: 'Dub', group: 'Space', description: 'Dark, pronounced echo repeats', filter: -35, grit: 10, echo: 90, reverb: 15 },
  { name: 'Cavern', group: 'Space', description: 'Distant echoes in a huge dark space', filter: -55, grit: 0, echo: 100, reverb: 85 },
  { name: 'Bright Echo', group: 'Space', description: 'Crisp repeats for plucks and keys', filter: 35, grit: 0, echo: 55, reverb: -20 },
  { name: 'Lo-fi', group: 'Texture', description: 'Dusty, softened digital grain', filter: -45, grit: -35, echo: -20, reverb: 0 },
  { name: 'Crunch', group: 'Texture', description: 'Strong warm overdrive', filter: -10, grit: 75, echo: 0, reverb: 0 },
  { name: 'Bitcrush', group: 'Texture', description: 'Deliberate crunchy digital steps', filter: 0, grit: -85, echo: 0, reverb: 0 },
  { name: 'Broken Toy', group: 'Texture', description: 'Tiny crushed speaker with a short echo', filter: 90, grit: -70, echo: -45, reverb: 0 },
  { name: 'Fuzz Room', group: 'Texture', description: 'Thick distortion in a tight room', filter: -30, grit: 100, echo: 0, reverb: -60 },
  { name: 'Ice', group: 'Texture', description: 'Thin, glassy reflections', filter: 100, grit: 0, echo: 25, reverb: 50 },
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
