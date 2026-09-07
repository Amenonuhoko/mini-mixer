import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'

interface PadAssignPromptProps {
  sampleId: string
  sampleLabel: string
  onDone: () => void
}

/**
 * Shown after a recording stops (or from the library's "Assign..." action).
 * Assigning is a reference change only — the sample stays in the library either
 * way, so overwriting a pad's current sound never actually deletes anything.
 */
export function PadAssignPrompt({ sampleId, sampleLabel, onDone }: PadAssignPromptProps) {
  const { state, dispatch } = useAppState()
  const [confirmPadId, setConfirmPadId] = useState<string | null>(null)
  const visiblePads = state.pads.slice(0, state.visiblePadCount)

  const assign = (padId: string) => {
    dispatch({ type: 'ASSIGN_SAMPLE_TO_PAD', padId, sampleId })
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
    <div className="panel assign-prompt" role="dialog" aria-label="Assign recording to a pad">
      <p>
        Assign <strong>{sampleLabel}</strong> to a pad:
      </p>
      <div className="pad-picker">
        {visiblePads.map((pad, index) => {
          const occupied = pad.sampleId !== null
          return (
            <button
              key={pad.id}
              type="button"
              className="pad-swatch"
              style={{ background: pad.color }}
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
        <div className="confirm-overwrite">
          <p>That pad already has a sound. Replace it?</p>
          <button type="button" onClick={() => assign(confirmPadId)}>
            Replace
          </button>
          <button type="button" onClick={() => setConfirmPadId(null)}>
            Cancel
          </button>
        </div>
      )}
      <button type="button" className="skip-assign" onClick={onDone}>
        Skip — keep it in the library only
      </button>
    </div>
  )
}
