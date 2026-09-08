import { useAppState } from '../state/AppStateContext'

/**
 * "Pad Record" — independent of the pad-grid mode (Off/Loop/Instrument/
 * Mixer): while on, holding the record FAB captures a live "playthrough" of
 * whatever the app is actually playing — every looping pad plus every manual
 * tap/gate — instead of recording from the microphone. Not mutually
 * exclusive with the grid mode; the whole point is recording a playthrough
 * of loops you've already started, or of an instrument you're playing live.
 *
 * Lives in the Pads panel header alongside the pad-grid mode controls
 * (Instrument/Loop/Mixer/FX) rather than the small floating record cluster
 * it used to sit in — it's a pad-grid concern (what holding Record captures
 * *from the pads*), so it earns a visible home there instead of being easy
 * to miss next to the mic button. Colored with the same "record" red the
 * mic button itself uses, always (not just once it's on), so it visually
 * reads as part of the recording family even at rest, distinct from the
 * blue/accent mode toggles beside it.
 */
export function PlaythroughToggle() {
  const { state, dispatch } = useAppState()
  const enabled = state.transport.playthroughRecordingEnabled

  return (
    <button
      type="button"
      className={enabled ? 'playthrough-btn on' : 'playthrough-btn'}
      onClick={() =>
        dispatch({ type: 'SET_PLAYTHROUGH_RECORDING_ENABLED', enabled: !enabled })
      }
      aria-pressed={enabled}
      aria-label="Pad Record"
      title={
        enabled
          ? 'Pad Record is on — holding Record captures everything currently playing on the pads'
          : 'Pad Record — turn on so holding Record captures the pads instead of the microphone'
      }
    >
      <PadRecordIcon />
    </button>
  )
}

function PadRecordIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="5" fill="currentColor" />
    </svg>
  )
}
