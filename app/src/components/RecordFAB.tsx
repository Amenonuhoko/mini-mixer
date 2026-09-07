import { useRef, useState } from 'react'
import { renderPerformance } from '../engine/bounce'
import { formatElapsed, useElapsedSeconds } from '../hooks/useElapsedSeconds'
import { useRecorder } from '../hooks/useRecorder'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { computePeaks } from '../utils/waveform'
import type { PendingRecording } from './RecordingReview'
import { LiveWaveform } from './Waveform'

const WAVEFORM_BUCKETS = 80

interface RecordFABProps {
  sampleCount: number
  onRecorded: (recording: PendingRecording) => void
}

/**
 * Floating, hold-to-record button, reachable from every page — recording isn't
 * tied to any one screen. Holding down is the recording gesture itself (like a
 * voice memo app): press starts, release stops, however long that is. No
 * separate tap-to-start/tap-to-stop mode to remember.
 *
 * While instrument mode is on, holding this button captures the series of pad
 * presses that happen during the hold instead of recording from the
 * microphone — see AudioEngine.startPerformanceCapture and engine/bounce.ts.
 * Same review step either way (onRecorded), since both end up as a plain
 * AudioBuffer + peaks.
 */
export function RecordFAB({ sampleCount, onRecorded }: RecordFABProps) {
  const { state } = useAppState()
  const engine = useEngine()
  const { isRecording, error, analyserRef, start, stop } = useRecorder()
  const [capturingPerformance, setCapturingPerformance] = useState(false)
  const elapsed = useElapsedSeconds(isRecording || capturingPerformance)
  const holdingRef = useRef(false)
  const instrumentModeEnabled = state.transport.padInstrumentModeEnabled

  const beginHold = (event: React.PointerEvent) => {
    event.preventDefault()
    if (holdingRef.current) return
    holdingRef.current = true
    if (instrumentModeEnabled) {
      engine.startPerformanceCapture()
      setCapturingPerformance(true)
      return
    }
    void start()
  }

  const endHold = () => {
    if (!holdingRef.current) return
    holdingRef.current = false
    if (capturingPerformance) {
      setCapturingPerformance(false)
      const hits = engine.stopPerformanceCapture()
      if (hits.length === 0) return
      void renderPerformance(hits).then((buffer) => {
        const peaks = computePeaks(buffer, WAVEFORM_BUCKETS)
        onRecorded({ label: `Performance ${sampleCount + 1}`, buffer, peaks })
      })
      return
    }
    void stop().then(async (arrayBuffer) => {
      if (arrayBuffer.byteLength === 0) return
      const buffer = await engine.decodeSample(arrayBuffer)
      const peaks = computePeaks(buffer, WAVEFORM_BUCKETS)
      onRecorded({ label: `Sample ${sampleCount + 1}`, buffer, peaks })
    })
  }

  return (
    <>
      {(isRecording || capturingPerformance) && (
        <div className="record-live-panel">
          <span className="record-dot" aria-hidden="true" />
          <span className="recorder-elapsed">{formatElapsed(elapsed)}</span>
          {capturingPerformance ? (
            <span className="muted">Tap pads to perform — release to finish</span>
          ) : (
            <>
              <LiveWaveform analyserRef={analyserRef} active={isRecording} />
              <span className="muted">Release to stop</span>
            </>
          )}
        </div>
      )}
      {error && <div className="record-error-toast">{error}</div>}
      <button
        type="button"
        className={isRecording || capturingPerformance ? 'record-fab active' : 'record-fab'}
        onPointerDown={beginHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
        aria-label={instrumentModeEnabled ? 'Hold to capture a performance' : 'Hold to record'}
      >
        <MicIcon />
      </button>
    </>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
