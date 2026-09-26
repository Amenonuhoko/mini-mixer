import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { createId } from '../state/defaults'
import { canApplyMove, endingBase, endingCarrier, TRANSITION_MOVES } from '../state/sectionEnding'
import type { AppState, TransitionMove } from '../state/types'
import { Overlay } from './Overlay'

interface TransitionSheetProps {
  sectionId: string
  onClose: () => void
}

/**
 * How a song section ends and leads into the next one. Opened from the
 * section's mix on the Song page. A move is written into the steps of the
 * pattern the section ends on (so Edit this can fine-tune it), previewed by
 * playing the handover, then kept or undone.
 */
export function TransitionSheet({ sectionId, onClose }: TransitionSheetProps) {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  // Whatever a preview creates keeps the same ids, so trying another move replaces it.
  const [ids] = useState(() => ({ section: createId('section'), pattern: createId('pattern') }))
  const preview = state.variationPreview?.label === 'Ending' ? state.variationPreview : undefined
  // Choices are judged against the song before this sheet's preview.
  const before: AppState = preview ? { ...state, patterns: preview.patterns, songSections: preview.songSections } : state
  const index = before.songSections.findIndex((section) => section.id === sectionId)
  const section = before.songSections[index]
  if (!section) return null
  const next = before.songSections[index + 1]
  const from = section.name || `Section ${index + 1}`
  const to = next ? next.name || `Section ${index + 2}` : null
  const hadEnding = !!endingCarrier(before.songSections, sectionId)
  const carrier = endingCarrier(state.songSections, sectionId)
  const current = carrier?.ending?.move ?? null
  const linked = before.songSections.filter((item) => item.patternId === section.patternId).length > 1
  const empty = !Object.values(endingBase(before, sectionId)?.steps ?? {}).some((row) => row.some(Boolean))

  const quiet = () => {
    engine.getContext()
    engine.setSequencerPlaybackEnabled(false)
    engine.stopAllSounds()
  }
  const pick = (move: TransitionMove | null) => {
    if (move === current) return
    quiet()
    dispatch({ type: 'PREVIEW_SECTION_ENDING', sectionId, move, ids })
  }
  const hearing = state.transport.isPlaying && state.transport.auditionScope === 'handover'
  const hear = () => {
    quiet()
    if (hearing) dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: false })
    else dispatch({ type: 'AUDITION_SONG_SECTION', sectionId: carrier?.id ?? sectionId, scope: 'handover' })
  }
  const undo = () => {
    if (preview) dispatch({ type: 'UNDO_VARIATION' })
    onClose()
  }

  return (
    <Overlay onClose={undo} title="Ending / transition" subtitle={to ? `${from} → ${to}` : `${from} → end of the song`}>
      <section className="sheet-section phrasing-editor transition-editor">
        <div className="phrasing-choices" role="group" aria-label={`How ${from} ends`}>
          <button type="button" className={`choice${current === null ? ' on' : ''}`} aria-pressed={current === null} disabled={!hadEnding && current === null} onClick={() => pick(null)}>
            <strong>None</strong><small>{hadEnding ? 'Take the ending out again.' : 'Plays straight into the next part.'}</small>
          </button>
          {TRANSITION_MOVES.map((move) => {
            const available = canApplyMove(before, sectionId, move.id)
            return (
              <button key={move.id} type="button" className={`choice${current === move.id ? ' on' : ''}`} aria-pressed={current === move.id} disabled={!available} onClick={() => pick(move.id)}>
                <strong>{move.label}</strong><small>{available ? move.hint : move.needs ?? 'Nothing to change here.'}</small>
              </button>
            )
          })}
        </div>
        {empty && <p className="sheet-note">{from} has no steps yet. Add some with Edit this, then come back to shape its ending.</p>}
        <p className="muted sheet-note">
          {!hadEnding && section.repeats > 1
            ? `${from} plays ${section.repeats}×. The ending goes on the last time, as a new “${from} ending” section. `
            : !hadEnding && linked
            ? `${from} gets its own copy of the pattern first, so the other sections that share it don't change. `
            : ''}
          The ending is written into the pattern's steps, so Edit this can fine-tune it. Picking another ending writes it again from the original.
        </p>
        <div className="sheet-actions">
          <button className="btn" type="button" onClick={hear}>{hearing ? 'Stop' : 'Hear the handover'}</button>
          <button className="btn" type="button" onClick={undo} disabled={!preview}>Undo</button>
          <button className="btn primary" type="button" onClick={() => { if (preview) dispatch({ type: 'KEEP_VARIATION' }); onClose() }}>{preview ? 'Keep' : 'Done'}</button>
        </div>
      </section>
    </Overlay>
  )
}
