import { useCallback } from 'react'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'

/**
 * Play / stop, the one way everything starts and stops the transport — the
 * Play button and the Space bar share it, so both stop the same way: the
 * scheduler is disabled synchronously before React's state update, then
 * every audible source is terminated, so no lookahead hit starts after Stop.
 */
export function useTogglePlayback(): () => void {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { isPlaying } = state.transport

  return useCallback(() => {
    if (isPlaying) {
      engine.setSequencerPlaybackEnabled(false)
      engine.stopAllSounds()
      dispatch({ type: 'SET_METRONOME_ENABLED', enabled: false })
    }
    dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: !isPlaying })
  }, [dispatch, engine, isPlaying])
}
