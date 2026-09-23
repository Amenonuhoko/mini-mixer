import { useEffect, useRef, useState } from 'react'
import { useEngine } from '../state/EngineContext'
import { useAppState } from '../state/AppStateContext'
import { getLibrarySamples } from '../state/librarySamples'
import { formatSampleDuration, sampleKindIcon, sampleKindLabel, sampleLoudness } from '../utils/sampleInfo'
import { ConfirmDialog } from './ConfirmDialog'
import { ChevronIcon, PadsIcon, PlayIcon, StopIcon, TrashIcon } from './icons'
import { LoadSequenceButton } from './LoadSequenceButton'
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
      <section className="module library" aria-label="Library">
        <header className="module-head">
          <h2 className="module-title">Library</h2>
          <span className="module-sub readout">{String(samples.length).padStart(2, '0')}</span>
        </header>
        {samples.length === 0 ? (
          <p className="empty-state">Nothing here yet — hold Record to capture your first sound.</p>
        ) : (
          <div className="library-grid">
            {samples.map((sample, index) => {
              const assignedPads = state.pads
                .map((pad, padIndex) => ({ pad, padIndex }))
                .filter(({ pad }) => pad.sampleId === sample.id)
              const isRenaming = renamingSampleId === sample.id
              const isDeleting = deletingSampleId === sample.id
              const previewing = previewingSampleId === sample.id

              return (
                <article className={previewing ? 'library-card playing' : 'library-card'} key={sample.id}>
                  <button
                    type="button"
                    className="library-card-wave"
                    onClick={() => togglePreview(sample.id)}
                    aria-pressed={previewing}
                    aria-label={previewing ? `Stop ${sample.label}` : `Play ${sample.label}`}
                    title={previewing ? 'Stop' : 'Play'}
                  >
                    <StaticWaveform peaks={sample.peaks} />
                    <span className="library-card-play" aria-hidden="true">
                      {previewing ? <StopIcon size={16} /> : <PlayIcon size={16} />}
                    </span>
                  </button>

                  {isRenaming ? (
                    <input
                      type="text"
                      className="text-input library-rename-input"
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
                      className="library-card-name"
                      onClick={() => startRename(sample.id, sample.label)}
                      title="Tap to rename"
                    >
                      {sample.label}
                    </button>
                  )}

                  <div className="library-card-facts">
                    <span className="chip">
                      <span aria-hidden="true">{sampleKindIcon(sample.kind)}</span>
                      {sampleKindLabel(sample.kind)}
                    </span>
                    <span className="readout">{formatSampleDuration(sample.buffer.duration)}</span>
                    <span className="library-card-loudness">{sampleLoudness(sample.peaks)}</span>
                  </div>

                  <div className="library-card-pads">
                    {assignedPads.length === 0 ? (
                      <span className="chip chip-dim">No pad</span>
                    ) : (
                      assignedPads.map(({ pad, padIndex }) => (
                        <span key={pad.id} className="chip chip-on">
                          P{String(padIndex + 1).padStart(2, '0')}
                        </span>
                      ))
                    )}
                  </div>

                  <div className="library-card-actions">
                    <button type="button" className="btn btn-sm" onClick={() => setAssigningSampleId(sample.id)}>
                      <PadsIcon size={14} />
                      Pad
                    </button>
                    {sample.kind === 'sequence' && sample.sequenceTrace && <LoadSequenceButton sample={sample} />}
                    <span className="library-card-spacer" />
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm"
                      disabled={index === 0}
                      onClick={() => dispatch({ type: 'MOVE_SAMPLE', sampleId: sample.id, direction: 'up' })}
                      aria-label="Move earlier"
                      title="Move earlier"
                    >
                      <ChevronIcon direction="left" size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm"
                      disabled={index === samples.length - 1}
                      onClick={() => dispatch({ type: 'MOVE_SAMPLE', sampleId: sample.id, direction: 'down' })}
                      aria-label="Move later"
                      title="Move later"
                    >
                      <ChevronIcon direction="right" size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn icon-btn-sm danger"
                      onClick={() => setDeletingSampleId(sample.id)}
                      aria-label={`Delete ${sample.label}`}
                      title="Delete"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
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
                </article>
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
