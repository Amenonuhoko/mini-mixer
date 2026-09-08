import type { AppState, Sample } from './types'

/**
 * The user-facing Library collection. Generated instrument keys are retained
 * as implementation data for pads/sequences but never exposed as library items.
 * Both Library surfaces call this selector so filtering and ordering cannot drift.
 */
export function getLibrarySamples(
  state: Pick<AppState, 'sampleOrder' | 'samples'>,
): Sample[] {
  return state.sampleOrder
    .map((sampleId) => state.samples[sampleId])
    .filter((sample): sample is Sample => sample !== undefined && sample.kind !== 'note')
}
