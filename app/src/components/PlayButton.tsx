import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { playScope } from '../utils/playScope'
import { PlayIcon, StopIcon } from './icons'

/**
 * Play / stop, raised in the middle of the bottom bar — the button pressed
 * most, so it sits right under the thumb.
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
      className={isPlaying ? 'play-btn on' : 'play-btn'}
      onClick={togglePlayback}
      aria-label={isPlaying ? `Stop ${scope}` : `Play ${scope}`}
      title={isPlaying ? `Stop ${scope}` : `Play ${scope}`}
    >
      {isPlaying ? <StopIcon size={24} /> : <PlayIcon size={24} />}
      <span className="play-btn-caption">{isPlaying ? 'STOP' : 'PLAY'}</span>
    </button>
  )
}
