import { useAppState } from '../state/AppStateContext'

/**
 * Global mode switch for the pad grid, living in the thumb-reachable FAB
 * cluster rather than the top nav — while on, tapping any pad toggles its
 * loop instead of playing a one-shot (see PadGrid). A page-agnostic mode
 * switch, same category as the metronome toggle right next to it.
 */
export function LoopModeButton() {
  const { state, dispatch } = useAppState()
  const { padLoopModeEnabled } = state.transport

  return (
    <button
      type="button"
      className={padLoopModeEnabled ? 'loop-mode-fab on' : 'loop-mode-fab'}
      onClick={() => dispatch({ type: 'SET_PAD_LOOP_MODE_ENABLED', enabled: !padLoopModeEnabled })}
      aria-pressed={padLoopModeEnabled}
      aria-label="Toggle loop mode"
      title={
        padLoopModeEnabled
          ? 'Loop mode on — tapping a pad toggles its loop'
          : 'Loop mode off — tapping a pad plays it'
      }
    >
      <LoopIcon />
    </button>
  )
}

function LoopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M4 12a8 8 0 0 1 13.66-5.66L20 8M20 8V3M20 8h-5M20 12a8 8 0 0 1-13.66 5.66L4 16M4 16v5M4 16h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
