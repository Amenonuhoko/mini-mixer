import type { SampleKind } from '../state/types'

/** Small glyph + label for a sample's kind — shown on its Library card. */
const KIND_INFO: Record<SampleKind, { icon: string; label: string }> = {
  recording: { icon: '🎤', label: 'Recording' },
  note: { icon: '🎹', label: 'Note' },
  sequence: { icon: '🥁', label: 'Sequence' },
}

export function sampleKindIcon(kind: SampleKind): string {
  return KIND_INFO[kind].icon
}

export function sampleKindLabel(kind: SampleKind): string {
  return KIND_INFO[kind].label
}

export function formatSampleDuration(seconds: number): string {
  return `${seconds.toFixed(1)}s`
}

export type LoudnessLabel = 'Quiet' | 'Medium' | 'Loud'

/**
 * A simple loudness descriptor derived from the sample's own precomputed
 * peaks (already 0-1 amplitudes) — no new audio analysis, just a threshold
 * over data the app already has.
 */
export function sampleLoudness(peaks: number[]): LoudnessLabel {
  const peak = peaks.reduce((max, value) => Math.max(max, value), 0)
  if (peak >= 0.7) return 'Loud'
  if (peak >= 0.3) return 'Medium'
  return 'Quiet'
}
