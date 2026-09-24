import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import { ConfirmDialog } from './ConfirmDialog'
import { Overlay } from './Overlay'
import { StaticWaveform } from './Waveform'
import { getSamplerBank, visibleBankPads } from '../state/banks'

interface PadAssignPromptProps {
  sampleId: string
  sampleLabel: string
  onDone: () => void
}

/**
 * Shown after a recording stops (or from the library's "Assign..." action).
 * Assigning is a reference change only — the sample stays in the library either
 * way, so overwriting a pad's current sound never actually deletes anything.
 * Doubles as the natural place to name the sample, since you're already looking
 * at it right after recording it.
 */
export function PadAssignPrompt({ sampleId, sampleLabel, onDone }: PadAssignPromptProps) {
  const { state, dispatch } = useAppState()
  const [confirmPadId, setConfirmPadId] = useState<string | null>(null)
  const [label, setLabel] = useState(sampleLabel)
  const visiblePads = visibleBankPads(state, getSamplerBank(state))
  const sample = state.samples[sampleId]

  const commitLabel = () => {
    if (label.trim() && label !== sampleLabel) {
      dispatch({ type: 'RENAME_SAMPLE', sampleId, label })
    }
  }

  const assign = (padId: string) => {
    commitLabel()
    dispatch({ type: 'ASSIGN_SAMPLE_TO_PAD', padId, sampleId })
    onDone()
  }

  const handleSkip = () => {
    commitLabel()
    onDone()
  }

  const handlePadClick = (padId: string, occupied: boolean) => {
    if (occupied) {
      setConfirmPadId(padId)
    } else {
      assign(padId)
    }
  }

  return (
    <Overlay onClose={handleSkip} title="Put on a pad" subtitle="Name it, then pick a pad. It stays in the library either way.">
      <div className="review">
        {sample && sample.peaks.length > 0 && (
          <span className="review-wave">
            <StaticWaveform peaks={sample.peaks} />
          </span>
        )}
        <label className="label" htmlFor="assign-prompt-name">
          Name
        </label>
        <input
          id="assign-prompt-name"
          type="text"
          className="text-input"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={commitLabel}
        />
        <span className="label">Pad</span>
        <div className="pad-picker">
          {visiblePads.map((pad, index) => {
            const occupied = pad.sampleId !== null
            return (
              <button
                key={pad.id}
                type="button"
                className={occupied ? 'pad-swatch filled' : 'pad-swatch'}
                onClick={() => handlePadClick(pad.id, occupied)}
                title={occupied ? 'Already has a sound — tap to replace' : 'Empty'}
                aria-label={`Pad ${index + 1}${occupied ? ' (has a sound)' : ''}`}
              >
                {String(index + 1).padStart(2, '0')}
              </button>
            )
          })}
        </div>
        {confirmPadId && (
          <ConfirmDialog
            message="That pad already has a sound. Replace it?"
            confirmLabel="Replace"
            onConfirm={() => assign(confirmPadId)}
            onCancel={() => setConfirmPadId(null)}
          />
        )}
      </div>
    </Overlay>
  )
}
