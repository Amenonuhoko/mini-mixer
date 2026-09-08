import { useEffect, useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { createId, timestampNow } from '../state/defaults'
import { useNavigation } from '../state/NavigationContext'
import { contrastingTextColor } from '../utils/color'
import type { SampleKind, SequenceTrace } from '../state/types'
import { StaticWaveform } from './Waveform'

export interface PendingRecording {
  label: string
  buffer: AudioBuffer
  peaks: number[]
  /** How this recording was made — see SampleKind. Defaults to 'recording' (a plain mic take) if omitted. */
  kind?: SampleKind
  /** Portable placement snapshot attached to a bounced sequence. */
  sequenceTrace?: SequenceTrace
}

interface RecordingReviewProps {
  recording: PendingRecording
  onDone: () => void
}

/**
 * Shown right after a recording stops. The recording is NOT yet in
 * AppState.samples — it only gets added when the user actually decides to
 * keep it (assign to a pad, or "keep in library only"). Discarding just
 * clears local state and calls onDone; the reducer is never touched, so a
 * throwaway take never clutters the library even momentarily.
 *
 * Loops the recording back immediately by default for a plain mic take —
 * hearing it on repeat is how you actually judge a fresh recording, rather
 * than having to assign it to a pad first just to hit play. A bare preview
 * loop (see AudioEngine.previewLoop), not a real pad trigger — no effects,
 * no library entry until you commit. A `kind: 'sequence'` recording (a
 * Bounce-to-Pad render or a Playthrough capture) does NOT auto-preview,
 * though — unlike a mic take, it was very likely built from pads/loops that
 * are still playing right now, and auto-looping it on top of that live mix
 * the instant this popup opens is exactly the messy overlap this review step
 * shouldn't cause. The play/pause button still works — it's just not
 * pressed automatically.
 *
 * Assigning to a pad doesn't close the review immediately — it hands you an
 * explicit "Edit this pad" vs "Done" choice first, so jumping straight into
 * trim/effects on what you just captured is one obvious tap away instead of
 * a separate hunt-down-the-pad-and-tap-Edit trip after closing this popup.
 */
export function RecordingReview({ recording, onDone }: RecordingReviewProps) {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { goToEditPad } = useNavigation()
  const [confirmPadId, setConfirmPadId] = useState<string | null>(null)
  const [assignedPadId, setAssignedPadId] = useState<string | null>(null)
  const [label, setLabel] = useState(recording.label)
  const [previewPlaying, setPreviewPlaying] = useState(recording.kind !== 'sequence')
  const visiblePads = state.pads.slice(0, state.visiblePadCount)

  useEffect(() => {
    if (!previewPlaying) return
    const source = engine.previewLoop(recording.buffer)
    return () => {
      try {
        source.stop()
      } catch {
        // Already stopped (e.g. by the panic "stop all sounds" button) — fine.
      }
    }
  }, [engine, recording.buffer, previewPlaying])

  const commit = (): string => {
    const id = createId('sample')
    dispatch({
      type: 'ADD_SAMPLE',
      sample: {
        id,
        label: label.trim() || recording.label,
        buffer: recording.buffer,
        recordedAt: timestampNow(),
        kind: recording.kind ?? 'recording',
        sequenceTrace: recording.sequenceTrace,
        peaks: recording.peaks,
      },
    })
    return id
  }

  const assign = (padId: string) => {
    const sampleId = commit()
    dispatch({ type: 'ASSIGN_SAMPLE_TO_PAD', padId, sampleId })
    setConfirmPadId(null)
    setAssignedPadId(padId)
  }

  const editAssignedPad = () => {
    if (!assignedPadId) return
    goToEditPad(assignedPadId)
    onDone()
  }

  const handlePadClick = (padId: string, occupied: boolean) => {
    if (occupied) {
      setConfirmPadId(padId)
    } else {
      assign(padId)
    }
  }

  const handleKeepInLibrary = () => {
    commit()
    onDone()
  }

  return (
    <div className="panel assign-prompt" role="dialog" aria-label="Review the recording">
      <div className="review-preview-row">
        <StaticWaveform peaks={recording.peaks} color="#6c5ce7" />
        <button
          type="button"
          className="btn btn-secondary btn-icon-only preview-toggle-btn"
          onClick={() => setPreviewPlaying((playing) => !playing)}
          aria-label={previewPlaying ? 'Pause preview loop' : 'Play preview loop'}
        >
          {previewPlaying ? <PauseGlyph /> : <PlayGlyph />}
        </button>
      </div>
      {assignedPadId ? (
        <div className="assigned-next-step">
          <p>
            Assigned to Pad {state.pads.findIndex((pad) => pad.id === assignedPadId) + 1}. Want to
            dial it in now?
          </p>
          <div className="review-actions">
            <button type="button" className="btn btn-primary" onClick={editAssignedPad}>
              Edit this pad
            </button>
            <button type="button" className="btn btn-secondary" onClick={onDone}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <label className="assign-prompt-name-label" htmlFor="recording-review-name">
            Name it
          </label>
          <input
            id="recording-review-name"
            type="text"
            className="assign-prompt-name"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
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
            <div className="confirm-overwrite">
              <p>That pad already has a sound. Replace it?</p>
              <button type="button" className="btn btn-danger" onClick={() => assign(confirmPadId)}>
                Replace
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmPadId(null)}>
                Cancel
              </button>
            </div>
          )}
          <div className="review-actions">
            <button type="button" className="btn btn-secondary" onClick={handleKeepInLibrary}>
              Keep in library only
            </button>
            <button type="button" className="btn btn-ghost-danger" onClick={onDone}>
              Discard recording
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M6 4l14 8-14 8V4z" fill="currentColor" />
    </svg>
  )
}

function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <rect x="6" y="4" width="4" height="16" fill="currentColor" />
      <rect x="14" y="4" width="4" height="16" fill="currentColor" />
    </svg>
  )
}
