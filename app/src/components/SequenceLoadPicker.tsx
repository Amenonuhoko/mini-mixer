import { useAppState } from '../state/AppStateContext'
import { getLibrarySamples } from '../state/librarySamples'
import { LoadSequenceButton } from './LoadSequenceButton'
import { Overlay } from './Overlay'
import { StaticWaveform } from './Waveform'

interface SequenceLoadPickerProps {
  onClose: () => void
}

/**
 * The Sequencer-side entry point for loading a previously saved (bounced)
 * sequence back into the active pattern — the same LOAD_SEQUENCE_TRACE flow
 * as the Library page's per-sample "Load" action, just reachable without
 * leaving the Sequencer first.
 */
export function SequenceLoadPicker({ onClose }: SequenceLoadPickerProps) {
  const { state } = useAppState()
  const sequences = getLibrarySamples(state).filter((sample) => sample.kind === 'sequence' && sample.sequenceTrace)

  return (
    <Overlay onClose={onClose}>
      <h2>Load a saved sequence</h2>
      {sequences.length === 0 ? (
        <p className="muted">No saved sequences yet — use "Save sequence" to bounce one first.</p>
      ) : (
        <ul className="library-picker-list">
          {sequences.map((sample) => (
            <li key={sample.id} className="sequence-load-picker-item">
              <StaticWaveform peaks={sample.peaks} color="#6c5ce7" />
              <span>{sample.label}</span>
              <LoadSequenceButton sample={sample} onLoaded={onClose} />
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn-secondary overlay-close" onClick={onClose}>
        Cancel
      </button>
    </Overlay>
  )
}
