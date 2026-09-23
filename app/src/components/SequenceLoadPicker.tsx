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
    <Overlay onClose={onClose} title="Load a sequence" subtitle="Brings a saved sequence back into this pattern.">
      {sequences.length === 0 ? (
        <p className="empty-state">No saved sequences yet — tap Save in the sequencer to keep one.</p>
      ) : (
        <ul className="list">
          {sequences.map((sample) => (
            <li key={sample.id} className="list-item static">
              <span className="list-wave">
                <StaticWaveform peaks={sample.peaks} />
              </span>
              <span className="list-name">{sample.label}</span>
              <LoadSequenceButton sample={sample} onLoaded={onClose} />
            </li>
          ))}
        </ul>
      )}
    </Overlay>
  )
}
