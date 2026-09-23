import { useEffect, useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { createId, timestampNow } from '../state/defaults'
import { MAX_PAD_COUNT } from '../state/constants'
import { useNavigation } from '../state/NavigationContext'
import type { SampleKind, SequenceTrace } from '../state/types'
import { ConfirmDialog } from './ConfirmDialog'
import { PauseIcon, PlayIcon, PlusIcon, TrashIcon } from './icons'
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
        ...(recording.sequenceTrace ? { sequenceTrace: recording.sequenceTrace } : {}),
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

  const assignToNewPad = () => {
    const id = createId('sample')
    dispatch({
      type: 'ADD_SAMPLE_TO_NEW_PAD',
      sample: {
        id,
        label: label.trim() || recording.label,
        buffer: recording.buffer,
        recordedAt: timestampNow(),
        kind: recording.kind ?? 'recording',
        ...(recording.sequenceTrace ? { sequenceTrace: recording.sequenceTrace } : {}),
        peaks: recording.peaks,
      },
    })
    onDone()
  }

  return (
    <div className="review">
      <div className="review-preview">
        <button
          type="button"
          className={previewPlaying ? 'icon-btn icon-btn-lg on' : 'icon-btn icon-btn-lg'}
          onClick={() => setPreviewPlaying((playing) => !playing)}
          aria-label={previewPlaying ? 'Pause preview loop' : 'Play preview loop'}
        >
          {previewPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <span className="review-wave">
          <StaticWaveform peaks={recording.peaks} />
        </span>
      </div>
      {assignedPadId ? (
        <div className="review-done">
          <p className="review-done-text">
            On pad <span className="readout">{String(state.pads.findIndex((pad) => pad.id === assignedPadId) + 1).padStart(2, '0')}</span>. Dial it in now?
          </p>
          <div className="review-actions">
            <button type="button" className="btn" onClick={onDone}>
              Done
            </button>
            <button type="button" className="btn btn-primary" onClick={editAssignedPad}>
              Edit pad
            </button>
          </div>
        </div>
      ) : (
        <>
          <label className="label" htmlFor="recording-review-name">
            Name
          </label>
          <input
            id="recording-review-name"
            type="text"
            className="text-input"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <span className="label">Put it on a pad</span>
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
            {visiblePads.length < MAX_PAD_COUNT && (
              <button
                type="button"
                className="pad-swatch pad-swatch-add"
                onClick={assignToNewPad}
                title="Add a new pad for this sequence"
                aria-label="Add new pad"
              >
                <PlusIcon size={14} />
              </button>
            )}
          </div>
          {confirmPadId && (
            <ConfirmDialog
              message="That pad already has a sound. Replace it?"
              confirmLabel="Replace"
              onConfirm={() => assign(confirmPadId)}
              onCancel={() => setConfirmPadId(null)}
            />
          )}
          <div className="review-actions">
            <button type="button" className="btn btn-ghost-danger" onClick={onDone}>
              <TrashIcon size={16} />
              Discard
            </button>
            <button type="button" className="btn" onClick={handleKeepInLibrary}>
              Library only
            </button>
          </div>
        </>
      )}
    </div>
  )
}

