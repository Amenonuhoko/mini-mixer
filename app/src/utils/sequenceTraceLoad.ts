import type { Sample, SequenceTrace } from '../state/types'

/**
 * What a single trace cell resolves to when loaded: a real, playable sample
 * id if it still exists in the library, or a "missing" marker if the
 * sample that was there at bounce time has since been deleted. Shared
 * between the reducer (LOAD_SEQUENCE_TRACE, which writes this into the
 * pattern) and the UI (which summarizes it for the loading confirmation).
 */
export function resolveSequenceTraceCell(
  sourceSampleId: string | null,
  samples: Record<string, Sample>,
): { sampleId: string | null; missing: boolean } {
  if (!sourceSampleId) return { sampleId: null, missing: false }
  if (samples[sourceSampleId]) return { sampleId: sourceSampleId, missing: false }
  return { sampleId: null, missing: true }
}

export interface SequenceTraceSummary {
  stepCount: number
  /** Hits that will become real, playable steps. */
  restoredHits: number
  /** Hits whose sample no longer exists — shown as a ghost trace marker instead. */
  missingHits: number
}

export function summarizeSequenceTrace(trace: SequenceTrace, samples: Record<string, Sample>): SequenceTraceSummary {
  let restoredHits = 0
  let missingHits = 0
  for (const row of trace.rows) {
    for (const sourceSampleId of row) {
      const cell = resolveSequenceTraceCell(sourceSampleId, samples)
      if (cell.sampleId) restoredHits += 1
      else if (cell.missing) missingHits += 1
    }
  }
  return { stepCount: trace.stepCount, restoredHits, missingHits }
}

export function describeSequenceTraceSummary(summary: SequenceTraceSummary): string {
  const totalHits = summary.restoredHits + summary.missingHits
  if (summary.missingHits === 0) {
    return `Loaded ${summary.stepCount} steps, ${totalHits} hit${totalHits === 1 ? '' : 's'} restored.`
  }
  return `Loaded ${summary.stepCount} steps, ${summary.restoredHits} of ${totalHits} hits restored — ${summary.missingHits} sample${summary.missingHits === 1 ? '' : 's'} no longer in the library.`
}
