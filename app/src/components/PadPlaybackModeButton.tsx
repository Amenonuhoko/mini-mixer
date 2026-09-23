import { useAppState } from '../state/AppStateContext'

/** Gate vs. one-shot as a two-sided switch, so the current pad-trigger duration is visible at a glance. */
export function PadPlaybackModeButton() {
  const { state, dispatch } = useAppState()
  const mode = state.transport.padPlaybackMode

  return (
    <div className="segmented segmented-sm" role="radiogroup" aria-label="Pad trigger">
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'gate'}
        className={mode === 'gate' ? 'segment on' : 'segment'}
        onClick={() => dispatch({ type: 'SET_PAD_PLAYBACK_MODE', mode: 'gate' })}
        title="Gate — the sound stops when you let go"
      >
        Gate
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'oneshot'}
        className={mode === 'oneshot' ? 'segment on' : 'segment'}
        onClick={() => dispatch({ type: 'SET_PAD_PLAYBACK_MODE', mode: 'oneshot' })}
        title="One-shot — the whole sample plays"
      >
        1-shot
      </button>
    </div>
  )
}
