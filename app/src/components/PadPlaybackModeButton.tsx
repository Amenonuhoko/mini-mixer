import { useAppState } from '../state/AppStateContext'

/** A two-sided switch makes the currently selected pad-trigger duration visible at a glance. */
export function PadPlaybackModeButton() {
  const { state, dispatch } = useAppState()
  const mode = state.transport.padPlaybackMode

  return (
    <button
      type="button"
      className={mode === 'oneshot' ? 'pad-playback-switch oneshot' : 'pad-playback-switch gate'}
      onClick={() =>
        dispatch({ type: 'SET_PAD_PLAYBACK_MODE', mode: mode === 'gate' ? 'oneshot' : 'gate' })
      }
      aria-label={mode === 'gate' ? 'Gate mode — tap to switch to one-shot' : 'One-shot mode — tap to switch to gate'}
      title={mode === 'gate' ? 'Gate: release stops sound' : 'One-shot: full sample plays'}
    >
      <span className={mode === 'gate' ? 'active' : ''}>Gate</span>
      <span className={mode === 'oneshot' ? 'active' : ''}>1-shot</span>
    </button>
  )
}
