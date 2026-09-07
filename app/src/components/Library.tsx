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
          {samples.map((sample) => {
            const assignedPads = state.pads
              .map((pad, index) => ({ pad, index }))
              .filter(({ pad }) => pad.sampleId === sample.id)
            return (
              <li key={sample.id}>
                <div className="library-item-info">
                  <span>{sample.label}</span>
                  <span className="library-item-tags">
                    {assignedPads.length === 0 ? (
                      <span className="tag tag-unassigned">unassigned</span>
                    ) : (
                      assignedPads.map(({ pad, index }) => (
                        <span key={pad.id} className="tag" style={{ background: pad.color }}>
                          Pad {index + 1}
                        </span>
                      ))
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setAssigningSampleId(sample.id)}
                >
                  Assign…
                </button>
              </li>
            )
          })}
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
