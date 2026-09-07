import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import { PadAssignPrompt } from './PadAssignPrompt'

export function Library() {
  const { state } = useAppState()
  const [assigningSampleId, setAssigningSampleId] = useState<string | null>(null)
  const samples = Object.values(state.samples).sort((a, b) => b.recordedAt - a.recordedAt)

  return (
    <section className="panel library" aria-label="sample library">
      <h2>Library ({samples.length})</h2>
      {samples.length === 0 ? (
        <p className="muted">Nothing recorded yet — hit Record to start your arsenal.</p>
      ) : (
        <ul className="library-list">
          {samples.map((sample) => (
            <li key={sample.id}>
              <span>{sample.label}</span>
              <button type="button" onClick={() => setAssigningSampleId(sample.id)}>
                Assign…
              </button>
            </li>
          ))}
        </ul>
      )}
      {assigningSampleId && (
        <PadAssignPrompt
          sampleId={assigningSampleId}
          sampleLabel={state.samples[assigningSampleId]?.label ?? ''}
          onDone={() => setAssigningSampleId(null)}
        />
      )}
    </section>
  )
}
