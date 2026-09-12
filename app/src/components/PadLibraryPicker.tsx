import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import { getLibrarySamples } from '../state/librarySamples'
import { ConfirmDialog } from './ConfirmDialog'
import { Overlay } from './Overlay'
import { StaticWaveform } from './Waveform'

interface PadLibraryPickerProps {
  padId: string
  onClose: () => void
}

/**
 * Quick "pull a sound from the library" popup, opened from a pad's action bar
 * on the Pads page — the reverse direction of the Library page's own
 * "Assign…" action, which starts from a sample and asks which pad. Lets you
 * swap a pad's sound without leaving the pad grid. This is the same user-facing
 * sample collection as Library itself, so generated Instrument Mode key files
 * are deliberately excluded; individual instrument keys stay internal to the
 * temporary instrument performance rather than becoming assignable Library items.
 */
export function PadLibraryPicker({ padId, onClose }: PadLibraryPickerProps) {
  const { state, dispatch } = useAppState()
  const [confirmSampleId, setConfirmSampleId] = useState<string | null>(null)
  const pad = state.pads.find((p) => p.id === padId)
  const samples = getLibrarySamples(state)

  const assign = (sampleId: string) => {
    dispatch({ type: 'ASSIGN_SAMPLE_TO_PAD', padId, sampleId })
    onClose()
  }

  const handlePick = (sampleId: string) => {
    if (pad?.sampleId && pad.sampleId !== sampleId) {
      setConfirmSampleId(sampleId)
    } else {
      assign(sampleId)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <h2>Choose from Library</h2>
      {samples.length === 0 ? (
        <p className="muted">Nothing in the library yet — hit Record to add something.</p>
      ) : (
        <ul className="library-picker-list">
          {samples.map((sample) => (
            <li key={sample.id}>
              <button
                type="button"
                className={
                  pad?.sampleId === sample.id
                    ? 'btn btn-secondary library-picker-btn current'
                    : 'btn btn-secondary library-picker-btn'
                }
                onClick={() => handlePick(sample.id)}
              >
                <StaticWaveform peaks={sample.peaks} color="#6c5ce7" />
                <span>{sample.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {confirmSampleId && (
        <ConfirmDialog
          message="Replace this pad's current sound?"
          confirmLabel="Replace"
          onConfirm={() => assign(confirmSampleId)}
          onCancel={() => setConfirmSampleId(null)}
        />
      )}
      <button type="button" className="btn btn-secondary overlay-close" onClick={onClose}>
        Cancel
      </button>
    </Overlay>
  )
}
