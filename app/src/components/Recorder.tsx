import { useState } from 'react'
import { useRecorder } from '../hooks/useRecorder'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { PadAssignPrompt } from './PadAssignPrompt'

export function Recorder() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { isRecording, level, error, start, stop } = useRecorder()
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

  return (
    <section className="panel recorder" aria-label="recording">
      <h2>Record</h2>
      <button
        type="button"
        className={isRecording ? 'record-btn active' : 'record-btn'}
        onClick={handleToggle}
      >
        {isRecording ? 'Stop' : 'Record'}
      </button>
      {isRecording && (
        <div className="level-meter" aria-hidden="true">
          <div className="level-meter-fill" style={{ width: `${Math.min(100, level * 220)}%` }} />
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
