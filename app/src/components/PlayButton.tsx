import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { playScope } from '../utils/playScope'
import { PlayIcon, StopIcon } from './icons'

/**
 * Play / stop, at the left end of the bottom bar — the button pressed most,
 * so it sits under the thumb rather than in the top corner.
 */
export function PlayButton() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { isPlaying } = state.transport
  const scope = playScope(state)

  const togglePlayback = () => {
    if (isPlaying) {
      // Disable the scheduler synchronously before React's state update, then
      // terminate all currently audible sources. This leaves no lookahead hit
      // behind to start after Stop has been pressed.
      engine.setSequencerPlaybackEnabled(false)
      engine.stopAllSounds()
      dispatch({ type: 'SET_METRONOME_ENABLED', enabled: false })
    }
    dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: !isPlaying })
  }

  return (
    <button
      type="button"
      className={isPlaying ? 'tab tab-play on' : 'tab tab-play'}
      onClick={togglePlayback}
      aria-label={isPlaying ? `Stop ${scope}` : `Play ${scope}`}
      title={isPlaying ? `Stop ${scope}` : `Play ${scope}`}
    >
      {isPlaying ? <StopIcon size={20} /> : <PlayIcon size={20} />}
      <span className="tab-label">{isPlaying ? 'Stop' : 'Play'}</span>
    </button>
  )
}
