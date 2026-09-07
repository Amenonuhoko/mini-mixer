import { useState } from 'react'
import { formatElapsed, useElapsedSeconds } from '../hooks/useElapsedSeconds'
import { useRecorder } from '../hooks/useRecorder'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { computePeaks } from '../utils/waveform'
import { RecordingReview, type PendingRecording } from './RecordingReview'
import { LiveWaveform } from './Waveform'

const WAVEFORM_BUCKETS = 80

export function Recorder() {
  const { state } = useAppState()
  const engine = useEngine()
  const { isRecording, error, analyserRef, start, stop } = useRecorder()
  const elapsed = useElapsedSeconds(isRecording)
  const [pendingRecording, setPendingRecording] = useState<PendingRecording | null>(null)

  const handleToggle = () => {
    if (isRecording) {
      void stop().then(async (arrayBuffer) => {
        if (arrayBuffer.byteLength === 0) return
        const buffer = await engine.decodeSample(arrayBuffer)
        const peaks = computePeaks(buffer, WAVEFORM_BUCKETS)
        const label = `Sample ${Object.keys(state.samples).length + 1}`
        // Not added to the library yet — RecordingReview only commits it if
        // the user chooses to keep it, so a discarded take never touches state.
        setPendingRecording({ label, buffer, peaks })
      })
    } else {
      void start()
    }
  }

  return (
    <section className="panel recorder" aria-label="recording">
      <h2>Record</h2>
      <div className="recorder-row">
        <button
          type="button"
          className={isRecording ? 'record-btn active' : 'record-btn'}
          onClick={handleToggle}
        >
          <span className="record-dot" aria-hidden="true" />
          {isRecording ? 'Stop' : 'Record'}
        </button>
        {isRecording && <span className="recorder-elapsed">{formatElapsed(elapsed)}</span>}
      </div>
      {isRecording && <LiveWaveform analyserRef={analyserRef} active={isRecording} />}
      {error && <p className="error-text">{error}</p>}
      {pendingRecording && (
        <RecordingReview recording={pendingRecording} onDone={() => setPendingRecording(null)} />
      )}
    </section>
  )
}
