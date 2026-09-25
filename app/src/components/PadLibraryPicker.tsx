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
 * sample collection as Library itself, so the notes/chords banks render for
 * their sounds are deliberately excluded — they belong to their bank.
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

  const padNumber = pad ? state.pads.indexOf(pad) + 1 : null

  return (
    <Overlay
      onClose={onClose}
      title={padNumber ? `Load pad ${String(padNumber).padStart(2, '0')}` : 'Load a sound'}
      subtitle="Pick a sound from your library."
    >
      {samples.length === 0 ? (
        <p className="empty-state">Nothing in the library yet — hold the mic button on the Pads page to capture a sound.</p>
      ) : (
        <ul className="list">
          {samples.map((sample) => (
            <li key={sample.id}>
              <button
                type="button"
                className={pad?.sampleId === sample.id ? 'list-item current' : 'list-item'}
                onClick={() => handlePick(sample.id)}
                aria-current={pad?.sampleId === sample.id ? 'true' : undefined}
              >
                <span className="list-wave">
                  <StaticWaveform peaks={sample.peaks} />
                </span>
                <span className="list-name">{sample.label}</span>
                {pad?.sampleId === sample.id && <span className="chip">On pad</span>}
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
    </Overlay>
  )
}
