import { createId, timestampNow } from '../state/defaults'
import type { Sample } from '../state/types'
import { computePeaks } from './waveform'

/** Matches the resolution RecordFAB/projectFile use for their own waveform thumbnails. */
const WAVEFORM_BUCKETS = 80

/**
 * Wraps a batch of freshly-rendered instrument-key buffers into real library
 * Samples, one per label. Shared by every place that builds an instrument
 * (InstrumentLibrary's preset/recording/drum-kit builders, and
 * InstrumentModeButton's quick-build-on-pick flow) so the label/kind/peaks
 * shaping stays in exactly one place rather than drifting across copies.
 */
export function buildKeySamples(buffers: AudioBuffer[], labels: string[]): Sample[] {
  return buffers.map((buffer, i) => ({
    id: createId('sample'),
    label: labels[i]!,
    buffer,
    recordedAt: timestampNow(),
    kind: 'note',
    peaks: computePeaks(buffer, WAVEFORM_BUCKETS),
  }))
}
