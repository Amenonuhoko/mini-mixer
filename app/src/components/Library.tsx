import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import { formatSampleDuration, sampleKindIcon, sampleKindLabel, sampleLoudness } from '../utils/sampleInfo'
import { InstrumentLibrary } from './InstrumentLibrary'
import { PadAssignPrompt } from './PadAssignPrompt'
import { StaticWaveform } from './Waveform'

/**
 * A grid of cards, not a list — each card leads with a big waveform (the
 * fastest way for a human to recognize a sound they've already heard) and a
 * row of at-a-glance facts: what kind of sample it is (recording/note/
 * sequence — see SampleKind), how long it is, and roughly how loud. All three
 * are derived from data the app already has (how the sample was made, its
 * buffer duration, its precomputed peaks) rather than any new audio analysis.
 *
 * Deliberately excludes `kind: 'note'` samples — an instrument's generated
 * keys. They're real library Samples under the hood (so pads can reference
 * them like anything else), but showing all 16 of an instrument's keys as
 * individual cards here would flood this grid the moment you build one
 * instrument, let alone several. They're managed as a unit via the
 * Instruments list above instead (deleting an instrument removes its keys
 * together) — building/applying an instrument should be quick and
 * self-contained, not spill 16 extra library entries into view.
 */
export function Library() {
  const { state, dispatch } = useAppState()
  const [assigningSampleId, setAssigningSampleId] = useState<string | null>(null)
  const [renamingSampleId, setRenamingSampleId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deletingSampleId, setDeletingSampleId] = useState<string | null>(null)

  const samples = state.sampleOrder
    .map((id) => state.samples[id])
    .filter((sample) => sample !== undefined)
    .filter((sample) => sample.kind !== 'note')

  const startRename = (sampleId: string, currentLabel: string) => {
    setRenamingSampleId(sampleId)
    setRenameDraft(currentLabel)
  }

  const commitRename = (sampleId: string) => {
    dispatch({ type: 'RENAME_SAMPLE', sampleId, label: renameDraft })
    setRenamingSampleId(null)
  }

  return (
    <div className="page library-page">
      <InstrumentLibrary />
      <section className="panel library" aria-label="sample library">
        <h2>Library ({samples.length})</h2>
        {samples.length === 0 ? (
          <p className="muted">Nothing recorded yet — hit Record to start your arsenal.</p>
        ) : (
          <div className="library-grid">
            {samples.map((sample, index) => {
              const assignedPads = state.pads
                .map((pad, padIndex) => ({ pad, padIndex }))
                .filter(({ pad }) => pad.sampleId === sample.id)
              const isRenaming = renamingSampleId === sample.id
              const isDeleting = deletingSampleId === sample.id

              return (
                <div className="library-card" key={sample.id}>
                  <div className="library-card-waveform">
                    <StaticWaveform peaks={sample.peaks} color="#6c5ce7" />
                  </div>

                  <div className="library-card-facts">
                    <span className="tag library-kind-badge">
                      <span aria-hidden="true">{sampleKindIcon(sample.kind)}</span>
                      {sampleKindLabel(sample.kind)}
                    </span>
                    <span className="muted library-card-fact">
                      {formatSampleDuration(sample.buffer.duration)}
                    </span>
                    <span className="muted library-card-fact">{sampleLoudness(sample.peaks)}</span>
                  </div>

                  {isRenaming ? (
                    <input
                      type="text"
                      className="library-rename-input"
                      value={renameDraft}
                      autoFocus
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onBlur={() => commitRename(sample.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitRename(sample.id)
                        if (event.key === 'Escape') setRenamingSampleId(null)
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="library-item-label"
                      onClick={() => startRename(sample.id, sample.label)}
                      title="Tap to rename"
                    >
                      {sample.label}
                    </button>
                  )}

                  <span className="library-item-tags">
                    {assignedPads.length === 0 ? (
                      <span className="tag tag-unassigned">unassigned</span>
                    ) : (
                      assignedPads.map(({ pad, padIndex }) => (
                        <span key={pad.id} className="tag" style={{ background: pad.color }}>
                          Pad {padIndex + 1}
                        </span>
                      ))
                    )}
                  </span>

                  <div className="library-card-actions">
                    <div className="reorder-buttons">
                      <button
                        type="button"
                        className="reorder-btn"
                        disabled={index === 0}
                        onClick={() =>
                          dispatch({ type: 'MOVE_SAMPLE', sampleId: sample.id, direction: 'up' })
                        }
                        aria-label="Move up"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="reorder-btn"
                        disabled={index === samples.length - 1}
                        onClick={() =>
                          dispatch({ type: 'MOVE_SAMPLE', sampleId: sample.id, direction: 'down' })
                        }
                        aria-label="Move down"
                      >
                        ▼
                      </button>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setAssigningSampleId(sample.id)}
                    >
                      Assign…
                    </button>
                    {isDeleting ? (
                      <span className="confirm-overwrite confirm-inline">
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => {
                            dispatch({ type: 'REMOVE_SAMPLE', sampleId: sample.id })
                            setDeletingSampleId(null)
                          }}
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setDeletingSampleId(null)}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary btn-icon-only"
                        onClick={() => setDeletingSampleId(sample.id)}
                        aria-label={`Delete ${sample.label}`}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {assigningSampleId && (
          <PadAssignPrompt
            sampleId={assigningSampleId}
            sampleLabel={state.samples[assigningSampleId]?.label ?? ''}
            onDone={() => setAssigningSampleId(null)}
          />
        )}
      </section>
    </div>
  )
}
