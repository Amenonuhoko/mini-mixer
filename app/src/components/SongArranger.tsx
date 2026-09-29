import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { useNavigation } from '../state/NavigationContext'
import { useTogglePlayback } from '../hooks/useTogglePlayback'
import { buildSongTimeline, sectionBankLevel } from '../engine/songTimeline'
import { renderSongToBuffer } from '../engine/bouncePattern'
import { encodeWav } from '../engine/projectFile'
import { computePeaks } from '../utils/waveform'
import { SONG_TEMPLATES } from '../engine/songTemplates'
import { BANK_NAMES } from '../state/banks'
import { ConfirmDialog } from './ConfirmDialog'
import { Overlay } from './Overlay'
import { Stepper } from './Stepper'
import { TransitionSheet } from './TransitionSheet'
import { endingCarrier, TRANSITION_MOVES } from '../state/sectionEnding'
import type { PendingRecording } from './RecordingReview'

/**
 * The Song menu, opened from Seq's header: a sheet holding a small, ordered
 * arrangement where each section points to one editable pattern. Play whole
 * song / Stop stays in the sheet's header (the sheet covers the transport, and
 * the header stays put as the sections scroll). Top to bottom: saving the song,
 * its structure and the ready-made structures; then the sections — each with
 * its name and ↑ ↓ on top, its pattern and repeats, its ending / transition
 * into the next section, its mix (which banks play and how loud — folded away
 * until asked for), Edit this (its pattern in Seq, looping), Play from here,
 * Duplicate (a numbered copy with its own identical pattern) and Remove; then
 * adding sections.
 */
export function SongArranger({ onBounced, onClose }: { onBounced: (recording: PendingRecording) => void; onClose: () => void }) {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { goToSequencer } = useNavigation()
  const togglePlayback = useTogglePlayback()
  const songMode = state.transport.playMode === 'song'
  const timeline = buildSongTimeline(state)
  const totalSteps = timeline.at(-1)?.endStep ?? 0
  const duration = Math.round((totalSteps * 60) / state.transport.bpm / 4)
  const [bouncing, setBouncing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [bounceError, setBounceError] = useState('')
  const [showStructures, setShowStructures] = useState(state.songSections.length <= 1)
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null)
  const [transitionFromId, setTransitionFromId] = useState<string | null>(null)
  // Sections whose mix is unfolded; each starts folded to a one-line summary.
  const [openMixIds, setOpenMixIds] = useState<ReadonlySet<string>>(new Set())
  const toggleMix = (sectionId: string) =>
    setOpenMixIds((open) => {
      const next = new Set(open)
      if (!next.delete(sectionId)) next.add(sectionId)
      return next
    })
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

  const applyTemplate = (templateId: string) => {
    const template = SONG_TEMPLATES.find((item) => item.id === templateId)
    if (!template) return
    engine.setSequencerPlaybackEnabled(false)
    engine.stopAllSounds()
    dispatch({ type: 'APPLY_SONG_TEMPLATE', sections: template.sections })
    setPendingTemplateId(null)
    setShowStructures(false)
  }

  const endingLabel = (sectionId: string) => {
    const move = endingCarrier(state.songSections, sectionId)?.ending?.move
    const label = TRANSITION_MOVES.find((item) => item.id === move)?.label
    return label ? `Ending: ${label} →` : 'Ending / transition →'
  }

  const audition = (sectionId: string, scope: 'section' | 'rest') => {
    engine.getContext()
    engine.setSequencerPlaybackEnabled(false)
    engine.stopAllSounds()
    dispatch({ type: 'AUDITION_SONG_SECTION', sectionId, scope })
  }

  const editSection = (sectionId: string, patternId: string) => {
    engine.getContext()
    engine.setSequencerPlaybackEnabled(false)
    engine.stopAllSounds()
    dispatch({ type: 'SET_ACTIVE_PATTERN', patternId })
    dispatch({ type: 'AUDITION_SONG_SECTION', sectionId, scope: 'loop' })
    onClose()
    goToSequencer()
  }

  const templates = (
    <div className="song-template-list" role="group" aria-label="Song structures">
      {SONG_TEMPLATES.map((template) => (
        <button
          type="button"
          className="song-template"
          key={template.id}
          aria-label={`${template.name}: ${template.sections.join(', ')}`}
          title={template.name}
          onClick={() => {
            // Nothing written yet means nothing to lose: switch straight away.
              if (!state.patterns.some((pattern) => Object.values(pattern.steps).some((row) => row.some(Boolean))))
              applyTemplate(template.id)
            else setPendingTemplateId(template.id)
          }}
        >
          <StructureBlocks parts={template.sections.map((name) => ({ name, weight: 1 }))} />
        </button>
      ))}
    </div>
  )

  const { isPlaying } = state.transport
  const firstSection = state.songSections[0]

  return (
    // Escape belongs to the sheet on top (the ending sheet, the structure prompt) while one is open.
    <Overlay
      onClose={() => {
        if (!transitionFromId && !pendingTemplateId) onClose()
      }}
      className="sheet-tall"
      title="Song"
      subtitle={`${state.songSections.length} sections · ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`}
      headerActions={
        isPlaying ? (
          <button type="button" className="chip-btn on song-play" onClick={togglePlayback} title="Stop playback">
            ■ Stop
          </button>
        ) : (
          <button
            type="button"
            className="chip-btn on song-play"
            onClick={() => firstSection && audition(firstSection.id, 'rest')}
            disabled={!songHasSteps}
            title="Play the whole song from the top"
          >
            ▶ Play song
          </button>
        )
      }
    >
      <div className="song-arranger">
      <div className="song-editor">
        <div className="song-export">
          <button
            type="button"
            className="btn btn-primary song-export-btn"
            onClick={() => void saveSong()}
            disabled={!songHasSteps || bouncing || exporting}
            title="Render the entire arrangement as one sample"
          >
            {bouncing ? 'Rendering…' : 'Save song'}
          </button>
          <button
            type="button"
            className="btn song-export-btn"
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
        <button
          type="button"
          className={showStructures ? 'song-structure open' : 'song-structure'}
          aria-expanded={showStructures}
          aria-label="Song structure — choose another"
          title="Choose a structure"
          onClick={() => setShowStructures(!showStructures)}
        >
          <StructureBlocks parts={state.songSections.map((section) => ({ name: section.name, weight: section.repeats }))} />
          <span className="song-structure-chevron" aria-hidden="true">{showStructures ? '▴' : '▾'}</span>
        </button>
        {showStructures && templates}
        <p className="song-hint">Edit this opens a section's pattern in Seq, looping it. ▶ Play from here plays on to the end — stop whenever you like.</p>
        <ol className="song-sections">
          {state.songSections.map((section, index) => {
            const linkedPattern = state.patterns.find((pattern) => pattern.id === section.patternId)
            const programmedBanks = state.banks
              .filter((bank) => bank.padIds.some((padId) => linkedPattern?.steps[padId]?.some(Boolean)))
              .map((bank) => bank.kind)
            const spanIndex = timeline.findIndex((span) => span.section.id === section.id)
            const restHasSteps = timeline
              .slice(spanIndex)
              .some((span) => Object.values(span.pattern.steps).some((row) => row.some(Boolean)))
            const playing = songMode && state.transport.isPlaying && state.transport.currentSongSectionId === section.id
            // How this section's controls are named — a part that appears more than once (Verse, Chorus) says which one.
            const baseName = section.name || `Section ${index + 1}`
            const name = state.songSections.filter((item) => item.name === section.name).length > 1 ? `${baseName} (part ${index + 1})` : baseName
            const linkedCount = state.songSections.filter((item) => item.patternId === section.patternId).length
            const mixOpen = openMixIds.has(section.id)
            const mixId = `song-mix-${section.id}`
            const leftOut = programmedBanks.filter((kind) => section.excludedBanks?.includes(kind)).length
            return (
              <li key={section.id} className={playing ? 'song-section playing' : 'song-section'}>
                <div className="song-section-top">
                  <span className="song-section-number">{index + 1}</span>
                  <input
                    className="song-section-name"
                    aria-label={`Section ${index + 1} name`}
                    value={section.name}
                    onChange={(event) => dispatch({ type: 'UPDATE_SONG_SECTION', sectionId: section.id, name: event.target.value })}
                    maxLength={40}
                  />
                  <div className="song-section-order" role="group" aria-label={`Move ${name}`}>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => dispatch({ type: 'MOVE_SONG_SECTION', sectionId: section.id, direction: -1 })}
                      disabled={index === 0}
                      aria-label={`Move ${name} earlier`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => dispatch({ type: 'MOVE_SONG_SECTION', sectionId: section.id, direction: 1 })}
                      disabled={index === state.songSections.length - 1}
                      aria-label={`Move ${name} later`}
                    >
                      ↓
                    </button>
                  </div>
                </div>
                <div className="song-section-setup">
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
                  <Stepper
                    label={`${name} repeats`}
                    value={`×${section.repeats}`}
                    onDecrement={() => dispatch({ type: 'UPDATE_SONG_SECTION', sectionId: section.id, repeats: section.repeats - 1 })}
                    onIncrement={() => dispatch({ type: 'UPDATE_SONG_SECTION', sectionId: section.id, repeats: section.repeats + 1 })}
                    decrementDisabled={section.repeats <= 1}
                    incrementDisabled={section.repeats >= 32}
                    decrementTitle={`Play ${name} one time fewer`}
                    incrementTitle={`Play ${name} one more time`}
                  />
                </div>
                {/* How this section leads into the next, and its own mix — which banks play in it and how loud — folded away until asked for. */}
                <div className="song-section-mix">
                  {programmedBanks.length === 0 ? (
                    <span className="song-section-summary">Empty pattern — edit to add sounds</span>
                  ) : (
                    <button
                      type="button"
                      className={mixOpen ? 'chip-btn song-mix-toggle open' : 'chip-btn song-mix-toggle'}
                      aria-expanded={mixOpen}
                      aria-controls={mixId}
                      aria-label={`${name} mix`}
                      title={mixOpen ? `Hide ${name}'s mix` : `Show ${name}'s mix — which banks play and how loud`}
                      onClick={() => toggleMix(section.id)}
                    >
                      <span>Mix · {programmedBanks.length} {programmedBanks.length === 1 ? 'bank' : 'banks'}{leftOut > 0 ? ` · ${leftOut} off` : ''}</span>
                      <span className="song-structure-chevron" aria-hidden="true">{mixOpen ? '▴' : '▾'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="chip-btn song-transition"
                    onClick={() => setTransitionFromId(section.id)}
                    aria-label={`Ending and transition out of ${name}`}
                  >
                    {endingLabel(section.id)}
                  </button>
                </div>
                {mixOpen && (
                  <div className="song-bank-list" id={mixId} role="group" aria-label={`${name} mix levels`}>
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
                )}
                <p className="song-section-summary song-link-note">{linkedCount > 1 ? 'Shared by ' + linkedCount + ' sections — editing updates all of them.' : 'Independent pattern — edits affect only this section.'}</p>
                <div className="song-section-actions">
                  <button
                    type="button"
                    className="chip-btn on"
                    onClick={() => editSection(section.id, section.patternId)}
                    aria-label={`Edit ${name} pattern in sequencer and loop this section`}
                  >
                    Edit this
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => audition(section.id, 'rest')}
                    disabled={!restHasSteps}
                    aria-label={`Play song from ${name}`}
                  >
                    ▶ Play from here
                  </button>
                  {linkedCount > 1 && <button type="button" className="chip-btn" onClick={() => dispatch({ type: 'MAKE_SECTION_UNIQUE', sectionId: section.id })} aria-label={`Make ${name} unique`}>Make this section unique</button>}
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => dispatch({ type: 'DUPLICATE_SONG_SECTION', sectionId: section.id })}
                    aria-label={`Duplicate ${name}`}
                    title={`Add a copy after this one, with its own identical pattern`}
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
        </div>
        {transitionFromId && (
          <TransitionSheet sectionId={transitionFromId} onClose={() => setTransitionFromId(null)} />
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
      </div>
    </Overlay>
  )
}

/** Short marks for common part names; anything else shows its first letter. */
const PART_MARKS: Record<string, string> = { intro: 'I', verse: 'V', chorus: 'C', bridge: 'Br', outro: 'O', build: 'Bu', drop: 'D', breakdown: 'Bd' }

/** A song's shape as coloured blocks, one per part, sized by how long it plays. */
function StructureBlocks({ parts }: { parts: { name: string; weight: number }[] }) {
  return (
    <span className="structure-blocks" aria-hidden="true">
      {parts.map((part, index) => {
        const key = part.name.toLowerCase().replace(/\s*\d+$/, '').replace(/ ending$/, '').trim()
        const mark = PART_MARKS[key] ?? (part.name.trim()[0] ?? '·').toUpperCase()
        return (
          <span key={index} className="structure-block" data-part={key in PART_MARKS ? key : 'other'} style={{ flexGrow: part.weight }}>
            {mark}
          </span>
        )
      })}
    </span>
  )
}
