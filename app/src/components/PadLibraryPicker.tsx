import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import type { Sample } from '../state/types'
import { StaticWaveform } from './Waveform'

interface PadLibraryPickerProps {
  padId: string
  onClose: () => void
}

/**
 * Quick "pull a sound from the library" popup, opened from a pad's action bar
 * on the Pads page — the reverse direction of the Library page's own
 * "Assign…" action, which starts from a sample and asks which pad. Lets you
 * swap a pad's sound without leaving the pad grid.
 */
export function PadLibraryPicker({ padId, onClose }: PadLibraryPickerProps) {
  const { state, dispatch } = useAppState()
  const [confirmSampleId, setConfirmSampleId] = useState<string | null>(null)
  const pad = state.pads.find((p) => p.id === padId)
  const samples = state.sampleOrder
    .map((id) => state.samples[id])
    .filter((sample): sample is Sample => sample !== undefined)

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
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="overlay-sheet" onClick={(event) => event.stopPropagation()}>
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
          <div className="confirm-overwrite">
            <span>Replace this pad's current sound?</span>
            <button type="button" className="btn btn-danger" onClick={() => assign(confirmSampleId)}>
              Replace
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirmSampleId(null)}
            >
              Cancel
            </button>
          </div>
        )}
        <button type="button" className="btn btn-secondary overlay-close" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
