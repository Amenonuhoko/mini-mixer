import { BPM_MAX, BPM_MIN } from '../state/constants'

/**
 * Every "feel" number of the tempo control, in one place for fine-tuning.
 * (See NOTES-tempo.md at the repo root for what's been tried.)
 */
export const TEMPO_FEEL = {
  /** Holding − / +: how long before it starts repeating. */
  holdDelayMs: 320,
  /** Fine phase: first repeat interval, and how much each repeat shortens it (×), down to the fastest. */
  repeatStartMs: 110,
  repeatAccel: 0.86,
  repeatMinMs: 70,
  /** After holding this long, steps become `coarseStep` (snapping to its multiples) at a steady, readable pace. */
  coarseAfterMs: 1000,
  coarseStep: 5,
  coarseIntervalMs: 160,
  /** Dragging the number: pixels of travel per BPM. */
  scrubPxPerBpm: 4,
  /** A press on the number that moves less than this (px) is a tap, which opens the tempo panel. */
  tapSlopPx: 6,
  /** Tap tempo: a gap longer than this starts a new count; this many taps are averaged. */
  tapResetMs: 2000,
  tapsAveraged: 4,
}

/** Quick picks in the tempo panel — the usual homes of common styles. */
export const TEMPO_PRESETS = [70, 80, 90, 100, 110, 120, 128, 140, 150, 174]

export function clampBpm(value: number): number {
  return Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(value)))
}

/**
 * One repeat of a held − / +: a single BPM at first, then — once held past
 * `coarseAfterMs` — jumps of `coarseStep`, snapping to its multiples (so
 * 118 goes 115, 110, 105… rather than 113, 108…).
 */
export function holdStep(bpm: number, direction: 1 | -1, heldMs: number): number {
  if (heldMs < TEMPO_FEEL.coarseAfterMs) return clampBpm(bpm + direction)
  const step = TEMPO_FEEL.coarseStep
  const snapped = direction < 0 ? Math.ceil(bpm / step) * step - step : Math.floor(bpm / step) * step + step
  return clampBpm(snapped)
}

/** Half-time / double-time, kept inside the tempo range. */
export function scaleBpm(bpm: number, factor: number): number {
  return clampBpm(bpm * factor)
}

/**
 * Tap tempo: the BPM of the latest taps (timestamps in ms, oldest first),
 * averaging up to `tapsAveraged` intervals; null until there are two taps.
 */
export function tapTempo(taps: readonly number[]): number | null {
  const recent = taps.slice(-(TEMPO_FEEL.tapsAveraged + 1))
  if (recent.length < 2) return null
  const average = (recent[recent.length - 1]! - recent[0]!) / (recent.length - 1)
  return average > 0 ? clampBpm(60000 / average) : null
}

/** Monotonic milliseconds for press/tap timing — a thin wrapper so the impure clock isn't called from component bodies. */
export function nowMs(): number {
  return performance.now()
}
