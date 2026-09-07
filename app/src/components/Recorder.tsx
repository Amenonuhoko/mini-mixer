import { useState } from 'react'
import { formatElapsed, useElapsedSeconds } from '../hooks/useElapsedSeconds'
import { useRecorder } from '../hooks/useRecorder'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { PadAssignPrompt } from './PadAssignPrompt'

const METER_SEGMENTS = 12

export function Recorder() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { isRecording, level, error, start, stop } = useRecorder()
  const elapsed = useElapsedSeconds(isRecording)
  const [pendingSample, setPendingSample] = useState<{ id: string; label: string } | null>(null)

  const handleToggle = () => {
    if (isRecording) {
      void stop().then(async (arrayBuffer) => {
        if (arrayBuffer.byteLength === 0) return
        const buffer = await engine.decodeSample(arrayBuffer)
        const id = `sample_${Math.random().toString(36).slice(2, 10)}`
        const label = `Sample ${Object.keys(state.samples).length + 1}`
        dispatch({ type: 'ADD_SAMPLE', sample: { id, label, buffer, recordedAt: Date.now() } })
        setPendingSample({ id, label })
      })
    } else {
      void start()
    }
  }

  const litSegments = Math.round(Math.min(1, level * 2.2) * METER_SEGMENTS)

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
      {isRecording && (
        <div className="level-meter" aria-hidden="true">
          {Array.from({ length: METER_SEGMENTS }, (_, i) => (
            <span key={i} className={i < litSegments ? 'meter-segment lit' : 'meter-segment'} />
          ))}
        </div>
      )}
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
