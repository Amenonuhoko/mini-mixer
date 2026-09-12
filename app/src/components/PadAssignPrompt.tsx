import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import { contrastingTextColor } from '../utils/color'
import { ConfirmDialog } from './ConfirmDialog'
import { StaticWaveform } from './Waveform'

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
  const visiblePads = state.pads.slice(0, state.visiblePadCount)
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
    <div className="panel assign-prompt" role="dialog" aria-label="Name and assign the recording">
      {sample && sample.peaks.length > 0 && <StaticWaveform peaks={sample.peaks} color="#6c5ce7" />}
      <label className="assign-prompt-name-label" htmlFor="assign-prompt-name">
        Name it
      </label>
      <input
        id="assign-prompt-name"
        type="text"
        className="assign-prompt-name"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        onBlur={commitLabel}
      />
      <p>Assign to a pad:</p>
      <div className="pad-picker">
        {visiblePads.map((pad, index) => {
          const occupied = pad.sampleId !== null
          return (
            <button
              key={pad.id}
              type="button"
              className="pad-swatch"
              style={{ background: pad.color, color: contrastingTextColor(pad.color) }}
              onClick={() => handlePadClick(pad.id, occupied)}
              title={occupied ? 'Already has a sound — tap to replace' : 'Empty'}
            >
              {index + 1}
              {occupied ? ' •' : ''}
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
      <button type="button" className="skip-assign" onClick={handleSkip}>
        Skip — keep it in the library only
      </button>
    </div>
  )
}
