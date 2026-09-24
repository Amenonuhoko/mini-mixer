import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { buildSongTimeline } from '../engine/songTimeline'
import { renderSongToBuffer } from '../engine/bouncePattern'
import { encodeWav } from '../engine/projectFile'
import { computePeaks } from '../utils/waveform'
import { SONG_TEMPLATES } from '../engine/songTemplates'
import { ConfirmDialog } from './ConfirmDialog'
import type { PendingRecording } from './RecordingReview'

/** A small, ordered arrangement: each section points to one editable pattern. */
export function SongArranger({
  onBounced,
  arrangerOpen,
  setArrangerOpen,
}: {
  onBounced: (recording: PendingRecording) => void
  arrangerOpen: boolean
  setArrangerOpen: (open: boolean) => void
}) {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const songMode = state.transport.playMode === 'song'
  const timeline = buildSongTimeline(state)
  const totalSteps = timeline.at(-1)?.endStep ?? 0
  const duration = Math.round((totalSteps * 60) / state.transport.bpm / 4)
  const [bouncing, setBouncing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [bounceError, setBounceError] = useState('')
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null)
  const songHasSteps = timeline.some(({ pattern }) =>
    Object.values(pattern.steps).some((row) => row.some(Boolean)),
  )

  const saveSong = async () => {
    if (bouncing) return
    setBouncing(true)
    setBounceError('')
    try {
      const buffer = await renderSongToBuffer(state)
      onBounced({
        label: `Song ${Object.keys(state.samples).length + 1}`,
        buffer,
        peaks: computePeaks(buffer, 80),
        kind: 'sequence',
      })
    } catch (error) {
      setBounceError(error instanceof Error ? error.message : 'Could not render song')
    } finally {
      setBouncing(false)
    }
  }

  const exportSong = async () => {
    if (exporting) return
    setExporting(true)
    setBounceError('')
    try {
      const buffer = await renderSongToBuffer(state)
      const url = URL.createObjectURL(new Blob([encodeWav(buffer)], { type: 'audio/wav' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `song-${new Date().toISOString().replace(/[:.]/g, '-')}.wav`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      setBounceError(error instanceof Error ? error.message : 'Could not export song')
    } finally {
      setExporting(false)
    }
  }

  const chooseMode = (mode: 'pattern' | 'song') => {
    if (mode === state.transport.playMode || (mode === 'song' && totalSteps === 0)) return
    if (mode === 'song') setArrangerOpen(true)
    if (state.transport.isPlaying) {
      engine.setSequencerPlaybackEnabled(false)
      engine.stopAllSounds()
      dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: false })
    }
    dispatch({ type: 'SET_PLAY_MODE', mode })
  }

  const applyTemplate = (templateId: string) => {
    const template = SONG_TEMPLATES.find((item) => item.id === templateId)
    if (!template) return
    engine.setSequencerPlaybackEnabled(false)
    engine.stopAllSounds()
    dispatch({ type: 'APPLY_SONG_TEMPLATE', sections: template.sections })
    setPendingTemplateId(null)
    setArrangerOpen(true)
  }

  const audition = (sectionId: string, scope: 'section' | 'rest') => {
    engine.setSequencerPlaybackEnabled(false)
    engine.stopAllSounds()
    dispatch({ type: 'AUDITION_SONG_SECTION', sectionId, scope })
    setArrangerOpen(true)
  }

  const editSection = (patternId: string) => {
    dispatch({ type: 'SET_ACTIVE_PATTERN', patternId })
    setArrangerOpen(false)
    requestAnimationFrame(() =>
      document.querySelector('.sequencer')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  return (
    <section className="module song-arranger" aria-label="Song arrangement">
      <header className="module-head">
        <h2 className="module-title">Song</h2>
        <span className="module-sub">
          {state.songSections.length} sections · {Math.floor(duration / 60)}:
          {String(duration % 60).padStart(2, '0')}
        </span>
        <button
          type="button"
          className={arrangerOpen ? 'chip-btn on' : 'chip-btn'}
          onClick={() => setArrangerOpen(!arrangerOpen)}
          aria-expanded={arrangerOpen}
          aria-controls="song-arrangement-editor"
        >
          Build song
        </button>
        <div className="module-head-tools song-mode" role="group" aria-label="Playback scope">
          <button
            type="button"
            className={songMode ? 'chip-btn' : 'chip-btn on'}
            onClick={() => chooseMode('pattern')}
            aria-pressed={!songMode}
          >
            Pattern
          </button>
          <button
            type="button"
            className={songMode ? 'chip-btn on' : 'chip-btn'}
            onClick={() => chooseMode('song')}
            disabled={totalSteps === 0}
            aria-pressed={songMode}
          >
            Song
          </button>
        </div>
      </header>
      {arrangerOpen && (
        <div id="song-arrangement-editor" className="song-editor">
          <div className="song-templates">
            <h3>Start with a structure</h3>
            <p className="song-hint">
              These are starting points, not rules. Each repeated section uses the same pattern
              until you change it.
            </p>
            <div className="song-template-list">
              {SONG_TEMPLATES.map((template) => (
                <button
                  type="button"
                  className="song-template"
                  key={template.id}
                  onClick={() => {
                    if (
                      state.songSections.length === 1 &&
                      state.songSections[0]?.name === 'Verse' &&
                      state.patterns.length === 1
                    )
                      applyTemplate(template.id)
                    else setPendingTemplateId(template.id)
                  }}
                >
                  <strong>{template.name}</strong>
                  <span>{template.sections.join(' → ')}</span>
                  <small>{template.description}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="song-preview-bar">
            <button
              type="button"
              className="chip-btn on"
              onClick={() => state.songSections[0] && audition(state.songSections[0].id, 'rest')}
              disabled={!songHasSteps}
            >
              ▶ Hear whole song
            </button>
            <span>
              Listen to the pattern changes, then use ▶ From here on a section to check a
              transition.
            </span>
          </div>
          <h3 className="song-editor-heading">
            Your sections <span>Drag-free: use ↑ ↓ to reorder</span>
          </h3>
          <div className="song-pattern-tools">
            <label className="song-field">
              Editing pattern
              <select
                value={state.activePatternId}
                onChange={(event) =>
                  dispatch({ type: 'SET_ACTIVE_PATTERN', patternId: event.target.value })
                }
              >
                {state.patterns.map((pattern) => (
                  <option key={pattern.id} value={pattern.id}>
                    {pattern.name}
                  </option>
                ))}
              </select>
            </label>
            <input
              className="song-pattern-name"
              aria-label="Pattern name"
              value={
                state.patterns.find((pattern) => pattern.id === state.activePatternId)?.name ?? ''
              }
              onChange={(event) =>
                dispatch({
                  type: 'RENAME_PATTERN',
                  patternId: state.activePatternId,
                  name: event.target.value,
                })
              }
              maxLength={40}
            />
            <button
              type="button"
              className="chip-btn"
              onClick={() => dispatch({ type: 'ADD_PATTERN' })}
            >
              + New pattern
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() => dispatch({ type: 'ADD_PATTERN', copyFromId: state.activePatternId })}
            >
              Duplicate pattern
            </button>
          </div>
          <ol className="song-sections">
            {state.songSections.map((section, index) => {
              const linkedPattern = state.patterns.find(
                (pattern) => pattern.id === section.patternId,
              )
              const soundingBanks = state.banks
                .filter((bank) =>
                  bank.padIds.some((padId) => linkedPattern?.steps[padId]?.some(Boolean)),
                )
                .map((bank) => bank.kind)
              const spanIndex = timeline.findIndex((span) => span.section.id === section.id)
              const restHasSteps = timeline
                .slice(spanIndex)
                .some((span) => Object.values(span.pattern.steps).some((row) => row.some(Boolean)))
              const playing =
                songMode &&
                state.transport.isPlaying &&
                state.transport.currentSongSectionId === section.id
              return (
                <li key={section.id} className={playing ? 'song-section playing' : 'song-section'}>
                  <span className="song-section-number">{index + 1}</span>
                  <input
                    className="song-section-name"
                    aria-label={`Section ${index + 1} name`}
                    value={section.name}
                    onChange={(event) =>
                      dispatch({
                        type: 'UPDATE_SONG_SECTION',
                        sectionId: section.id,
                        name: event.target.value,
                      })
                    }
                    maxLength={40}
                  />
                  <select
                    aria-label={`${section.name || `Section ${index + 1}`} pattern`}
                    value={section.patternId}
                    onChange={(event) => {
                      dispatch({
                        type: 'UPDATE_SONG_SECTION',
                        sectionId: section.id,
                        patternId: event.target.value,
                      })
                      dispatch({ type: 'SET_ACTIVE_PATTERN', patternId: event.target.value })
                    }}
                  >
                    {state.patterns.map((pattern) => (
                      <option key={pattern.id} value={pattern.id}>
                        {pattern.name}
                      </option>
                    ))}
                  </select>
                  <label className="song-repeats">
                    ×{' '}
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={section.repeats}
                      aria-label={`${section.name || `Section ${index + 1}`} repeats`}
                      onChange={(event) =>
                        dispatch({
                          type: 'UPDATE_SONG_SECTION',
                          sectionId: section.id,
                          repeats: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <span className="song-section-summary">
                    {soundingBanks.length
                      ? soundingBanks.join(' · ')
                      : 'Empty pattern — edit to add sounds'}
                  </span>
                  <div className="song-section-actions">
                    <button
                      type="button"
                      className="chip-btn on"
                      onClick={() => editSection(section.patternId)}
                      aria-label={`Edit ${section.name} pattern in sequencer`}
                    >
                      Edit {linkedPattern?.name ?? 'pattern'} ↓
                    </button>
                    <button
                      type="button"
                      className="chip-btn"
                      onClick={() => audition(section.id, 'section')}
                      disabled={!soundingBanks.length}
                      aria-label={`Hear ${section.name} section`}
                    >
                      ▶ Section
                    </button>
                    <button
                      type="button"
                      className="chip-btn"
                      onClick={() => audition(section.id, 'rest')}
                      disabled={!restHasSteps}
                      aria-label={`Hear song from ${section.name}`}
                    >
                      ▶ From here
                    </button>
                    <button
                      type="button"
                      className="chip-btn"
                      onClick={() =>
                        dispatch({
                          type: 'MOVE_SONG_SECTION',
                          sectionId: section.id,
                          direction: -1,
                        })
                      }
                      disabled={index === 0}
                      aria-label={`Move ${section.name} earlier`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="chip-btn"
                      onClick={() =>
                        dispatch({ type: 'MOVE_SONG_SECTION', sectionId: section.id, direction: 1 })
                      }
                      disabled={index === state.songSections.length - 1}
                      aria-label={`Move ${section.name} later`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="chip-btn"
                      onClick={() =>
                        dispatch({ type: 'DUPLICATE_SONG_SECTION', sectionId: section.id })
                      }
                      aria-label={`Duplicate ${section.name}`}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      className="chip-btn danger"
                      onClick={() =>
                        dispatch({ type: 'REMOVE_SONG_SECTION', sectionId: section.id })
                      }
                      aria-label={`Remove ${section.name}`}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              )
            })}
          </ol>
          <div className="song-footer">
            <button
              type="button"
              className="chip-btn song-add"
              onClick={() => dispatch({ type: 'ADD_SONG_SECTION' })}
            >
              + Add section
            </button>
            <button
              type="button"
              className="chip-btn on"
              onClick={() => void saveSong()}
              disabled={!songHasSteps || bouncing || exporting}
              title="Render the entire arrangement as one sample"
            >
              {bouncing ? 'Rendering…' : 'Save song'}
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() => void exportSong()}
              disabled={!songHasSteps || bouncing || exporting}
              title="Download the entire arrangement as a WAV file"
            >
              {exporting ? 'Exporting…' : 'Export WAV'}
            </button>
          </div>
          {bounceError && (
            <p className="song-error" role="alert">
              {bounceError}
            </p>
          )}
          {pendingTemplateId && (
            <ConfirmDialog
              message="Replace the current section order with this example? Your patterns and sounds stay saved."
              confirmLabel="Use structure"
              onConfirm={() => applyTemplate(pendingTemplateId)}
              onCancel={() => setPendingTemplateId(null)}
            />
          )}
        </div>
      )}
    </section>
  )
}
