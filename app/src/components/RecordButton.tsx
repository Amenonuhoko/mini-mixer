import { useCallback, useRef, useState } from 'react'
import { formatElapsed, useElapsedSeconds } from '../hooks/useElapsedSeconds'
import { useRecorder } from '../hooks/useRecorder'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { computePeaks } from '../utils/waveform'
import { LiveIcon, MicIcon } from './icons'
import type { PendingRecording } from './RecordingReview'
import { LiveWaveform } from './Waveform'

const WAVEFORM_BUCKETS = 80

interface RecordButtonProps {
  sampleCount: number
  onRecorded: (recording: PendingRecording) => void
  /** A smaller, caption-less button for a toolbar row. */
  compact?: boolean
}

/**
 * Hold-to-record, on the Pads page beside the bank's sound —
 * holding down is the recording gesture itself (press starts, release stops,
 * however long that is), so there's no separate start/stop state to remember.
 *
 * What it records depends on the source switch beside it (see
 * RecordSourceToggle): the microphone, or a live mix of whatever the app is
 * playing right now (every looping pad plus every manual tap/gate). Same
 * review step either way, since both end up as a plain AudioBuffer + peaks.
 */
export function RecordButton({ sampleCount, onRecorded, compact = false }: RecordButtonProps) {
  const { state } = useAppState()
  const engine = useEngine()
  const getContext = useCallback(() => engine.getContext(), [engine])
  const { isRecording, error, analyserRef, start, stop } = useRecorder(getContext)
  const [capturingPlaythrough, setCapturingPlaythrough] = useState(false)
  const elapsed = useElapsedSeconds(isRecording || capturingPlaythrough)
  const holdingRef = useRef(false)
  const playthroughEnabled = state.transport.playthroughRecordingEnabled
  const recording = isRecording || capturingPlaythrough

  const beginHold = (event: React.PointerEvent) => {
    event.preventDefault()
    if (holdingRef.current) return
    holdingRef.current = true
    if (playthroughEnabled) {
      engine.startPlaythroughRecording()
      setCapturingPlaythrough(true)
      return
    }
    void start()
  }

  const endHold = () => {
    if (!holdingRef.current) return
    holdingRef.current = false
    if (capturingPlaythrough) {
      setCapturingPlaythrough(false)
      void engine.stopPlaythroughRecording().then(async (arrayBuffer) => {
        if (arrayBuffer.byteLength === 0) return
        const buffer = await engine.decodeSample(arrayBuffer)
        const peaks = computePeaks(buffer, WAVEFORM_BUCKETS)
        onRecorded({ label: `Playthrough ${sampleCount + 1}`, buffer, peaks, kind: 'sequence' })
      })
      return
    }
    void stop().then(async (arrayBuffer) => {
      if (arrayBuffer.byteLength === 0) return
      const buffer = await engine.decodeSample(arrayBuffer)
      const peaks = computePeaks(buffer, WAVEFORM_BUCKETS)
      onRecorded({ label: `Sample ${sampleCount + 1}`, buffer, peaks, kind: 'recording' })
    })
  }

  return (
    <>
      {recording && (
        <div className="record-live" role="status">
          <span className="record-live-dot" aria-hidden="true" />
          <span className="readout">{formatElapsed(elapsed)}</span>
          {capturingPlaythrough ? (
            <span className="record-live-hint">Capturing the live mix · release to finish</span>
          ) : (
            <>
              <LiveWaveform analyserRef={analyserRef} active={isRecording} />
              <span className="record-live-hint">Release to stop</span>
            </>
          )}
        </div>
      )}
      {error && <div className="toast toast-danger">{error}</div>}
      <button
        type="button"
        className={['record-btn', compact ? 'compact' : '', recording ? 'on' : ''].filter(Boolean).join(' ')}
        onPointerDown={beginHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
        onContextMenu={(event) => event.preventDefault()}
        aria-label={playthroughEnabled ? 'Hold to record the live mix' : 'Hold to record from the microphone'}
        title={playthroughEnabled ? 'Hold to record the live mix' : 'Hold to record'}
      >
        {playthroughEnabled ? <LiveIcon size={compact ? 18 : 24} /> : <MicIcon size={compact ? 18 : 24} />}
        {!compact && <span className="record-btn-caption">HOLD</span>}
      </button>
    </>
  )
}

/** Picks what the record button captures: the microphone, or the app's own live mix. */
export function RecordSourceToggle() {
  const { state, dispatch } = useAppState()
  const live = state.transport.playthroughRecordingEnabled

  return (
    <button
      type="button"
      className={live ? 'rec-source on' : 'rec-source'}
      onClick={() => dispatch({ type: 'SET_PLAYTHROUGH_RECORDING_ENABLED', enabled: !live })}
      aria-pressed={live}
      aria-label={live ? 'Record source: live mix (tap for microphone)' : 'Record source: microphone (tap for live mix)'}
      title={live ? 'Recording the live mix — tap to record the mic' : 'Recording the mic — tap to record the live mix'}
    >
      <span className="rec-source-label">{live ? 'Mix' : 'Mic'}</span>
    </button>
  )
}
