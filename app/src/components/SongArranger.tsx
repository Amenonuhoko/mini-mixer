import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { useNavigation } from '../state/NavigationContext'
import { buildSongTimeline, sectionBankLevel } from '../engine/songTimeline'
import { renderSongToBuffer } from '../engine/bouncePattern'
import { encodeWav } from '../engine/projectFile'
import { computePeaks } from '../utils/waveform'
import { SONG_TEMPLATES } from '../engine/songTemplates'
import { BANK_NAMES } from '../state/banks'
import { ConfirmDialog } from './ConfirmDialog'
import type { PendingRecording } from './RecordingReview'

/**
 * The Song page: a small, ordered arrangement where each section points to
 * one editable pattern. Top to bottom: what Play plays (pattern or song) and
 * a whole-song preview; the sections — each with its pattern, repeats, its
 * own mix (which banks play, and how loud) and Edit, which opens its pattern
 * in the sequencer looping that section; adding sections and rendering the
 * song; and ready-made structures to start from.
 */
export function SongArranger({ onBounced }: { onBounced: (recording: PendingRecording) => void }) {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { goToSequencer } = useNavigation()
  const songMode = state.transport.playMode === 'song'
  const timeline = buildSongTimeline(state)
  const totalSteps = timeline.at(-1)?.endStep ?? 0
  const duration = Math.round((totalSteps * 60) / state.transport.bpm / 4)
  const [bouncing, setBouncing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [bounceError, setBounceError] = useState('')
  const [showStructures, setShowStructures] = useState(state.songSections.length <= 1)
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
    setShowStructures(false)
  }

  const audition = (sectionId: string, scope: 'section' | 'rest') => {
    engine.setSequencerPlaybackEnabled(false)
    engine.stopAllSounds()
    dispatch({ type: 'AUDITION_SONG_SECTION', sectionId, scope })
  }

  const editSection = (sectionId: string, patternId: string) => {
    engine.setSequencerPlaybackEnabled(false)
    engine.stopAllSounds()
    dispatch({ type: 'SET_ACTIVE_PATTERN', patternId })
    dispatch({ type: 'AUDITION_SONG_SECTION', sectionId, scope: 'loop' })
    goToSequencer()
  }

  const templates = (
    <div className="song-templates">
      <h3>Start with a structure</h3>
      <p className="song-hint">
        These are starting points, not rules. Each repeated section uses the same pattern until you change it.
      </p>
      <div className="song-template-list">
        {SONG_TEMPLATES.map((template) => (
          <button
            type="button"
            className="song-template"
            key={template.id}
            onClick={() => {
              if (state.songSections.length === 1 && state.songSections[0]?.name === 'Verse' && state.patterns.length === 1)
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
  )

  return (
    <section className="module song-arranger" aria-label="Song arrangement">
      <header className="module-head">
        <h2 className="module-title">Song</h2>
        <span className="module-sub">
          {state.songSections.length} sections · {Math.floor(duration / 60)}:{String(duration % 60).padStart(2, '0')}
        </span>
        <div className="module-head-tools song-mode" role="group" aria-label="Playback scope">
          <button type="button" className={songMode ? 'chip-btn' : 'chip-btn on'} onClick={() => chooseMode('pattern')} aria-pressed={!songMode}>
            Pattern
          </button>
          <button
            type="button"
            className={songMode ? 'chip-btn on' : 'chip-btn'}
            onClick={() => chooseMode('song')}
            disabled={totalSteps === 0}
            aria-pressed={songMode}
          >
            Whole song
          </button>
        </div>
      </header>
      <div className="song-editor">
        <p className="song-hint">1. Choose a structure. 2. Make a starting beat in any section. 3. Create related parts, then edit each section while it loops.</p>
        <button type="button" className="chip-btn" aria-expanded={showStructures} onClick={() => setShowStructures(!showStructures)}>Choose song structure</button>
        {showStructures && templates}
        <div className="song-preview-bar">
          <button
            type="button"
            className="chip-btn on"
            onClick={() => state.songSections[0] && audition(state.songSections[0].id, 'rest')}
            disabled={!songHasSteps}
          >
            ▶ Play whole song
          </button>
          <span>Edit opens a section's pattern in Seq, looping it. ▶ From here checks a transition.</span>
        </div>
        <ol className="song-sections">
          {state.songSections.map((section, index) => {
            const linkedPattern = state.patterns.find((pattern) => pattern.id === section.patternId)
            const programmedBanks = state.banks
              .filter((bank) => bank.padIds.some((padId) => linkedPattern?.steps[padId]?.some(Boolean)))
              .map((bank) => bank.kind)
            const soundingBanks = programmedBanks.filter((kind) => !section.excludedBanks?.includes(kind))
            const spanIndex = timeline.findIndex((span) => span.section.id === section.id)
            const restHasSteps = timeline
              .slice(spanIndex)
              .some((span) => Object.values(span.pattern.steps).some((row) => row.some(Boolean)))
            const playing = songMode && state.transport.isPlaying && state.transport.currentSongSectionId === section.id
            const name = section.name || `Section ${index + 1}`
            const linkedCount = state.songSections.filter((item) => item.patternId === section.patternId).length
            return (
              <li key={section.id} className={playing ? 'song-section playing' : 'song-section'}>
                <span className="song-section-number">{index + 1}</span>
                <input
                  className="song-section-name"
                  aria-label={`Section ${index + 1} name`}
                  value={section.name}
                  onChange={(event) => dispatch({ type: 'UPDATE_SONG_SECTION', sectionId: section.id, name: event.target.value })}
                  maxLength={40}
                />
                <select
                  aria-label={`${name} pattern`}
                  value={section.patternId}
                  onChange={(event) => {
                    dispatch({ type: 'UPDATE_SONG_SECTION', sectionId: section.id, patternId: event.target.value })
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
                    aria-label={`${name} repeats`}
                    onChange={(event) => dispatch({ type: 'UPDATE_SONG_SECTION', sectionId: section.id, repeats: Number(event.target.value) })}
                  />
                </label>
                {/* This section's own mix: which banks play in it, and how loud. The pattern's steps stay as they are. */}
                <div className="song-section-mix" role="group" aria-label={`${name} mix`}>
                  {programmedBanks.length === 0 && <span className="song-section-summary">Empty pattern — edit to add sounds</span>}
                  {programmedBanks.map((kind) => {
                    const removed = section.excludedBanks?.includes(kind) ?? false
                    const level = Math.round(sectionBankLevel(section, kind) * 100)
                    return (
                      <div className={removed ? 'song-bank removed' : 'song-bank'} key={kind}>
                        <button
                          type="button"
                          className={removed ? 'chip-btn song-bank-toggle' : 'chip-btn on song-bank-toggle'}
                          onClick={() => dispatch({ type: 'SET_SONG_SECTION_BANK_INCLUDED', sectionId: section.id, bank: kind, included: removed })}
                          aria-pressed={!removed}
                          aria-label={`${BANK_NAMES[kind]} in ${name}`}
                          title={removed ? `Bring ${BANK_NAMES[kind]} back into ${name}` : `Leave ${BANK_NAMES[kind]} out of ${name} — its steps stay saved`}
                        >
                          {BANK_NAMES[kind]}
                        </button>
                        <input
                          type="range"
                          className="slider"
                          style={{ '--fill': `${level / 100}` } as React.CSSProperties}
                          min={0}
                          max={100}
                          value={level}
                          disabled={removed}
                          aria-label={`${BANK_NAMES[kind]} volume in ${name}`}
                          onChange={(event) =>
                            dispatch({ type: 'SET_SONG_SECTION_BANK_VOLUME', sectionId: section.id, bank: kind, level: Number(event.target.value) })
                          }
                        />
                        <span className="readout song-bank-level">{removed ? 'Off' : `${level}%`}</span>
                      </div>
                    )
                  })}
                </div>
                <p className="song-section-summary song-link-note">{linkedCount > 1 ? 'Shared by ' + linkedCount + ' sections — editing updates all of them.' : 'Independent pattern — edits affect only this section.'}</p>
                <div className="song-section-actions">
                  {linkedCount > 1 && <button type="button" className="chip-btn" onClick={() => dispatch({ type: 'MAKE_SECTION_UNIQUE', sectionId: section.id })}>Make this section unique</button>}
                  <button
                    type="button"
                    className="chip-btn on"
                    onClick={() => editSection(section.id, section.patternId)}
                    aria-label={`Edit ${name} pattern in sequencer and loop this section`}
                  >
                    Edit {name}
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => audition(section.id, 'section')}
                    disabled={!soundingBanks.length}
                    aria-label={`Hear ${name} section`}
                  >
                    ▶ Hear
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => audition(section.id, 'rest')}
                    disabled={!restHasSteps}
                    aria-label={`Hear song from ${name}`}
                  >
                    ▶ From here
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => dispatch({ type: 'MOVE_SONG_SECTION', sectionId: section.id, direction: -1 })}
                    disabled={index === 0}
                    aria-label={`Move ${name} earlier`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => dispatch({ type: 'MOVE_SONG_SECTION', sectionId: section.id, direction: 1 })}
                    disabled={index === state.songSections.length - 1}
                    aria-label={`Move ${name} later`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => dispatch({ type: 'DUPLICATE_SONG_SECTION', sectionId: section.id })}
                    aria-label={`Duplicate ${name}`}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="chip-btn danger"
                    onClick={() => dispatch({ type: 'REMOVE_SONG_SECTION', sectionId: section.id })}
                    aria-label={`Remove ${name}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ol>
        <div className="song-footer">
          <button type="button" className="chip-btn song-add" onClick={() => dispatch({ type: 'ADD_SONG_SECTION' })}>
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
    </section>
  )
}
