import { newSeed } from '../styles/random'
import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { useGroove } from '../hooks/useGroove'
import { BANK_KINDS, BANK_NAMES } from '../state/banks'
import type { BankKind } from '../state/types'
import { VARIATIONS, varyPattern, type VariationKind } from '../styles/variations'

export function VariationPanel({ song = false }: { song?: boolean }) {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { hearBeat, busy } = useGroove()
  const [evolve, setEvolve] = useState(false)
  const [transition, setTransition] = useState<'none' | 'fill' | 'pause' | 'bass-drop'>('none')
  const [notice, setNotice] = useState('')
  const pattern = state.patterns.find((item) => item.id === state.activePatternId)
  const locked = pattern?.variationLocks ?? []
  const setLocked = (items: BankKind[]) => dispatch({ type: 'SET_VARIATION_LOCKS', locked: items })
  const hasNotes = !!pattern && Object.values(pattern.steps).some((row) => row.some(Boolean))
  const change = (kind: VariationKind) => {
    if (!pattern) return
    const nextSeed = newSeed()
    const proposed = varyPattern(state, pattern, kind, locked, nextSeed)
    if (JSON.stringify(proposed.steps) === JSON.stringify(pattern.steps)) {
      setNotice('No change available with these notes and locks. For a drum fill or crash, use a kit with those sounds.')
      return
    }
    setNotice('')
    dispatch({ type: 'PREVIEW_VARIATION', kind, locked, seed: nextSeed })
    hearBeat()
  }
  return <details className="variation-panel" open={song || /ending$/i.test(pattern?.name ?? '') || undefined}>
    <summary>Develop {song ? 'your song' : 'this beat'}</summary>
    <p className="muted">Lock parts you like. Changes keep your instruments, key and tempo.</p>
    {song && <label>Starting beat <select aria-label="Starting beat for related song parts" value={state.activePatternId} onChange={(event) => dispatch({ type: 'SET_ACTIVE_PATTERN', patternId: event.target.value })}>
      {state.patterns.map((item) => <option key={item.id} value={item.id}>{item.name}{Object.values(item.steps).some((row) => row.some(Boolean)) ? '' : ' (empty)'}</option>)}
    </select></label>}
    <div className="beat-options" role="group" aria-label="Lock parts during variation">
      {BANK_KINDS.map((kind) => <label key={kind}><input type="checkbox" checked={locked.includes(kind)} onChange={() => setLocked(locked.includes(kind) ? locked.filter((item) => item !== kind) : [...locked, kind])} />Lock {BANK_NAMES[kind]}</label>)}
    </div>
    {song ? <>
      <div className="beat-options">
        <label><input type="checkbox" checked={evolve} onChange={(event) => setEvolve(event.target.checked)} />Evolve repeated sections</label>
        <label>Transitions <select value={transition} onChange={(event) => setTransition(event.target.value as typeof transition)}>
          <option value="none">None</option><option value="fill">Drum fills</option><option value="pause">Short pauses</option><option value="bass-drop">Bass dropouts</option>
        </select></label>
      </div>
      <p className="muted">Create quieter verses and breakdowns, fuller choruses and drops from this beat. Repeated names share a pattern unless Evolve is on. Transitions affect only the final repeat. Existing patterns stay saved; the arrangement will use the new versions.</p>
      <button type="button" className="btn btn-primary" disabled={!hasNotes || !state.songSections.length || busy !== null || !!state.variationPreview || locked.length === 4} onClick={() => {
        engine.getContext()
        engine.setSequencerPlaybackEnabled(false)
        engine.stopAllSounds()
        dispatch({ type: 'PREVIEW_RELATED_SONG', locked, evolve, seed: newSeed(), ...(transition !== 'none' ? { transition } : {}) })
        const first = state.songSections[0]
        if (first) dispatch({ type: 'AUDITION_SONG_SECTION', sectionId: first.id, scope: 'rest' })
      }}>Create related parts & hear song</button>
      {!hasNotes && <p className="muted">Choose a starting beat with notes, or Edit a section and use Make a beat first.</p>}
    </> : <>
      <div className="beat-actions">{VARIATIONS.map((item) => <button type="button" className="chip-btn" key={item.id} disabled={!hasNotes || busy !== null || locked.length === 4} onClick={() => change(item.id)}>{item.label}</button>)}</div>
      <p className="muted">Fill, pause and bass dropout change the last beat; crash adds the opening hit. These repeat with the pattern. Use Song → Edit ending / transition to change only the final repeat.</p>
    </>}
    {notice && <p role="status">{notice}</p>}
  </details>
}

export function VariationDecision() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  if (!state.variationPreview) return null
  return <aside className="variation-decision" aria-label="Variation audition">
    <strong>{state.variationPreview.label} · auditioning</strong>
    <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'KEEP_VARIATION' })}>Keep</button>
    <button type="button" className="btn" onClick={() => { engine.setSequencerPlaybackEnabled(false); engine.stopAllSounds(); dispatch({ type: 'UNDO_VARIATION' }) }}>Undo</button>
    <small>Further musical edits keep this version. Undo restores the version before this audition.</small>
  </aside>
}
