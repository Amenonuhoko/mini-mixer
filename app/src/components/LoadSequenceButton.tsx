import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import { useNavigation } from '../state/NavigationContext'
import { describeSequenceTraceSummary, summarizeSequenceTrace } from '../utils/sequenceTraceLoad'
import type { Sample } from '../state/types'
import { ConfirmDialog } from './ConfirmDialog'

interface LoadSequenceButtonProps {
  sample: Sample
  label?: string
  className?: string
  onLoaded?: () => void
}

/**
 * Loads a bounced sequence's saved trace back into the active pattern as
 * real, playable steps (see the LOAD_SEQUENCE_TRACE reducer case) — shared
 * by the Library's per-sample action and the Sequencer's own "Load
 * sequence" picker. This replaces the active pattern's current steps, so
 * it confirms first and shows exactly how many steps/hits are coming back
 * before committing, rather than after the fact.
 */
export function LoadSequenceButton({ sample, label = 'Load', className = 'btn btn-secondary', onLoaded }: LoadSequenceButtonProps) {
  const { state, dispatch } = useAppState()
  const { goToSequencer } = useNavigation()
  const [confirming, setConfirming] = useState(false)
  const trace = sample.sequenceTrace
  if (!trace) return null
  const summary = summarizeSequenceTrace(trace, state.samples)

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setConfirming(true)}
        title={`Load "${sample.label}" into the active pattern`}
      >
        {label}
      </button>
      {confirming && (
        <ConfirmDialog
          message={`Load "${sample.label}" into the active pattern? ${describeSequenceTraceSummary(summary)} This replaces the pattern's current steps.`}
          confirmLabel="Load"
          onConfirm={() => {
            dispatch({ type: 'LOAD_SEQUENCE_TRACE', patternId: state.activePatternId, trace, markerSampleId: sample.id })
            setConfirming(false)
            goToSequencer()
            onLoaded?.()
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}
