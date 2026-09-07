import { useState } from 'react'
import { formatElapsed, useElapsedSeconds } from '../hooks/useElapsedSeconds'
import { useRecorder } from '../hooks/useRecorder'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { computePeaks } from '../utils/waveform'
import { PadAssignPrompt } from './PadAssignPrompt'
import { LiveWaveform } from './Waveform'

const WAVEFORM_BUCKETS = 80

export function Recorder() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { isRecording, error, analyserRef, start, stop } = useRecorder()
  const elapsed = useElapsedSeconds(isRecording)
  const [pendingSample, setPendingSample] = useState<{ id: string; label: string } | null>(null)

  const handleToggle = () => {
    if (isRecording) {
      void stop().then(async (arrayBuffer) => {
        if (arrayBuffer.byteLength === 0) return
        const buffer = await engine.decodeSample(arrayBuffer)
        const id = `sample_${Math.random().toString(36).slice(2, 10)}`
        const label = `Sample ${Object.keys(state.samples).length + 1}`
        const peaks = computePeaks(buffer, WAVEFORM_BUCKETS)
        dispatch({
          type: 'ADD_SAMPLE',
          sample: { id, label, buffer, recordedAt: Date.now(), peaks },
        })
        setPendingSample({ id, label })
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
      {pendingSample && (
        <PadAssignPrompt
          sampleId={pendingSample.id}
          sampleLabel={pendingSample.label}
          onDone={() => setPendingSample(null)}
        />
      )}
    </section>
  )
}
