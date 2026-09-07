import { useSyncExternalStore } from 'react'
import type { AudioEngine } from '../engine/AudioEngine'

/** Reactively tracks whether a pad is currently in a looping playback state. */
export function usePadLooping(engine: AudioEngine, padId: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => engine.subscribe(onStoreChange),
    () => engine.isPadLooping(padId),
  )
}
