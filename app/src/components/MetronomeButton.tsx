import { useAppState } from '../state/AppStateContext'

/**
 * Lives beside the record FAB, not in the play bar — like recording, the
 * metronome is meant to be reachable from anywhere and toggled on its own,
 * independent of sequencer play/pause (see useBeatEngine's shared-clock
 * decoupling). Grouping it with the FAB reflects that shared "global utility,
 * not tied to any one page or to transport state" nature.
 */
export function MetronomeButton() {
  const { state, dispatch } = useAppState()
  const { metronomeEnabled } = state.transport

  return (
    <button
      type="button"
      className={metronomeEnabled ? 'metronome-fab on' : 'metronome-fab'}
      onClick={() => dispatch({ type: 'SET_METRONOME_ENABLED', enabled: !metronomeEnabled })}
      aria-pressed={metronomeEnabled}
      aria-label="Toggle metronome"
      title={metronomeEnabled ? 'Metronome on — tap to turn off' : 'Metronome off — tap to turn on'}
    >
      <MetronomeIcon />
    </button>
  )
}

function MetronomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M8 21h8L13.5 5h-3L8 21z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M12 5v6l4 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="3" r="1.5" fill="currentColor" />
    </svg>
  )
}
