import { useAppState } from '../state/AppStateContext'

/**
 * Chooses the normal pad-trigger behavior. Loop Mode still has its own
 * explicit toggle; this only decides whether a non-looping pad release cuts
 * its note short (Gate) or lets the triggered sample play through (One-shot).
 */
export function PadPlaybackModeButton() {
  const { state, dispatch } = useAppState()
  const mode = state.transport.padPlaybackMode
  const nextMode = mode === 'gate' ? 'oneshot' : 'gate'

  return (
    <button
      type="button"
      className={mode === 'oneshot' ? 'pad-playback-mode-btn oneshot' : 'pad-playback-mode-btn'}
      onClick={() => dispatch({ type: 'SET_PAD_PLAYBACK_MODE', mode: nextMode })}
      aria-label={mode === 'gate' ? 'Gate mode — tap to switch to one-shot' : 'One-shot mode — tap to switch to gate'}
      title={mode === 'gate' ? 'Gate: release stops the sound — tap for one-shot' : 'One-shot: tap plays the full sound — tap for gate'}
    >
      {mode === 'gate' ? 'GATE' : '1-SHOT'}
    </button>
  )
}
