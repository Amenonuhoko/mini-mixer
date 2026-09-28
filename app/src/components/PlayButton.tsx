import { useTogglePlayback } from '../hooks/useTogglePlayback'
import { useAppState } from '../state/AppStateContext'
import { playScope } from '../utils/playScope'
import { PlayIcon, StopIcon } from './icons'

/**
 * Play / stop, raised in the middle of the bottom bar — the button pressed
 * most, so it sits right under the thumb (and under the Space bar on a
 * keyboard — see useTransportKeys; both go through useTogglePlayback).
 */
export function PlayButton() {
  const { state } = useAppState()
  const { isPlaying } = state.transport
  const scope = playScope(state)
  const togglePlayback = useTogglePlayback()

  return (
    <button
      type="button"
      className={isPlaying ? 'play-btn on' : 'play-btn'}
      onClick={togglePlayback}
      aria-label={isPlaying ? `Stop ${scope}` : `Play ${scope}`}
      title={isPlaying ? `Stop ${scope} (Space)` : `Play ${scope} (Space)`}
    >
      <span className="play-halo" data-beat-halo aria-hidden="true" />
      {isPlaying ? <StopIcon size={24} /> : <PlayIcon size={24} />}
      <span className="play-btn-caption">{isPlaying ? 'STOP' : 'PLAY'}</span>
    </button>
  )
}
