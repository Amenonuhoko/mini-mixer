import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'

/** Keep or undo a tweak while you hear it (see Make a beat's Tweak row). */
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
