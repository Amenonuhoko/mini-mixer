import { useEffect, useRef, useState } from 'react'
import { useEngine } from '../state/EngineContext'
import { useAppState } from '../state/AppStateContext'
import { useNavigation } from '../state/NavigationContext'
import { getLibrarySamples } from '../state/librarySamples'
import { formatSampleDuration, sampleKindIcon, sampleKindLabel, sampleLoudness } from '../utils/sampleInfo'
import { ConfirmDialog } from './ConfirmDialog'
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
 * Pads-page Instrument Mode picker instead (deleting an instrument still
 * removes its keys together) — building/applying an instrument should be quick
 * and self-contained, not spill 16 extra library entries into view.
 */
export function Library() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { goToSequencer } = useNavigation()
  const [assigningSampleId, setAssigningSampleId] = useState<string | null>(null)
  const [renamingSampleId, setRenamingSampleId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deletingSampleId, setDeletingSampleId] = useState<string | null>(null)
  const [previewingSampleId, setPreviewingSampleId] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement | null>(null)

  const samples = getLibrarySamples(state)

  const togglePreview = (sampleId: string) => {
    if (previewingSampleId === sampleId) {
      engine.stopLibraryPreview()
      setPreviewingSampleId(null)
      return
    }
    const sample = state.samples[sampleId]
    if (!sample) return
    setPreviewingSampleId(sampleId)
    engine.previewSample(sample.buffer, () => setPreviewingSampleId((current) => (current === sampleId ? null : current)))
  }

  useEffect(() => () => engine.stopLibraryPreview(), [engine])

  const startRename = (sampleId: string, currentLabel: string) => {
    setRenamingSampleId(sampleId)
    setRenameDraft(currentLabel)
  }

  const commitRename = (sampleId: string) => {
    dispatch({ type: 'RENAME_SAMPLE', sampleId, label: renameDraft })
    setRenamingSampleId(null)
  }

  useEffect(() => {
    if (!renamingSampleId) return
    const commitWhenClickingAway = (event: PointerEvent) => {
      if (!renameInputRef.current?.contains(event.target as Node)) {
        dispatch({ type: 'RENAME_SAMPLE', sampleId: renamingSampleId, label: renameDraft })
        setRenamingSampleId(null)
      }
    }
    document.addEventListener('pointerdown', commitWhenClickingAway)
    return () => document.removeEventListener('pointerdown', commitWhenClickingAway)
  }, [dispatch, renamingSampleId, renameDraft])

  return (
    <div className="page library-page">
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
                      ref={renameInputRef}
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
                      className={previewingSampleId === sample.id ? 'btn btn-secondary library-preview-btn playing' : 'btn btn-secondary library-preview-btn'}
                      onClick={() => togglePreview(sample.id)}
                      aria-pressed={previewingSampleId === sample.id}
                      title={previewingSampleId === sample.id ? 'Stop preview' : `Play ${sample.label}`}
                    >
                      {previewingSampleId === sample.id ? 'Stop' : 'Play'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setAssigningSampleId(sample.id)}
                    >
                      Assign…
                    </button>
                    {sample.kind === 'sequence' && sample.sequenceTrace && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          dispatch({
                            type: 'LOAD_SEQUENCE_TRACE',
                            patternId: state.activePatternId,
                            trace: sample.sequenceTrace!,
                            markerSampleId: sample.id,
                          })
                          goToSequencer()
                        }}
                        title="Open this bounced sequence as a visual trace"
                      >
                        Trace
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-icon-only"
                      onClick={() => setDeletingSampleId(sample.id)}
                      aria-label={`Delete ${sample.label}`}
                    >
                      🗑
                    </button>
                    {isDeleting && (
                      <ConfirmDialog
                        message={`Delete "${sample.label}"? This can't be undone.`}
                        confirmLabel="Delete"
                        onConfirm={() => {
                          dispatch({ type: 'REMOVE_SAMPLE', sampleId: sample.id })
                          setDeletingSampleId(null)
                        }}
                        onCancel={() => setDeletingSampleId(null)}
                      />
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
