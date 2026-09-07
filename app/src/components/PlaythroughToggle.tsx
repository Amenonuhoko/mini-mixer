import { useAppState } from '../state/AppStateContext'

/**
 * Independent of the pad-grid mode (Off/Loop/Instrument, see GridModeButton):
 * while on, holding the record FAB captures a live "playthrough" of whatever
 * the app is actually playing — every looping pad plus every manual tap/gate
 * — instead of recording from the microphone. Not mutually exclusive with the
 * grid mode; the whole point is recording a playthrough of loops you've
 * already started, or of an instrument you're playing live.
 */
export function PlaythroughToggle() {
  const { state, dispatch } = useAppState()
  const enabled = state.transport.playthroughRecordingEnabled

  return (
    <button
      type="button"
      className={enabled ? 'playthrough-fab on' : 'playthrough-fab'}
      onClick={() =>
        dispatch({ type: 'SET_PLAYTHROUGH_RECORDING_ENABLED', enabled: !enabled })
      }
      aria-pressed={enabled}
      aria-label="Toggle playthrough recording"
      title={
        enabled
          ? 'Playthrough recording on — holding Record captures everything currently playing'
          : 'Playthrough recording off — holding Record captures from the microphone'
      }
    >
      <PlaythroughIcon />
    </button>
  )
}

function PlaythroughIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <path
        d="M7.5 7.5a6.5 6.5 0 0 0 0 9M16.5 7.5a6.5 6.5 0 0 1 0 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
