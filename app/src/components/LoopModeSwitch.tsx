import { useAppState } from '../state/AppStateContext'

/**
 * Loop Mode gets its own always-visible switch, top-right of the Pads panel
 * header — it's reached for often enough that burying it inside the
 * GridModeButton menu (a two-tap "open menu, then pick Loop Mode") was more
 * friction than a mode this central deserves. Still just dispatches
 * SET_PAD_LOOP_MODE_ENABLED — the reducer's existing mutual exclusivity with
 * Instrument/Mixer mode applies exactly the same regardless of which control
 * flips it.
 */
export function LoopModeSwitch() {
  const { state, dispatch } = useAppState()
  const enabled = state.transport.padLoopModeEnabled

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      className={enabled ? 'loop-switch on' : 'loop-switch'}
      onClick={() => dispatch({ type: 'SET_PAD_LOOP_MODE_ENABLED', enabled: !enabled })}
      title={
        enabled
          ? 'Loop mode on — tapping a pad toggles its loop'
          : 'Loop mode off — tapping a pad plays it'
      }
    >
      <LoopGlyph className="loop-switch-icon" />
      <span className="loop-switch-track">
        <span className="loop-switch-thumb" />
      </span>
    </button>
  )
}

function LoopGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className={className}>
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
