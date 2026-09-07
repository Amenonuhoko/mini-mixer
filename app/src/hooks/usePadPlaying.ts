import { useSyncExternalStore } from 'react'
import type { AudioEngine } from '../engine/AudioEngine'

/** Reactively tracks whether a pad is currently making sound (looping or a one-shot in flight). */
export function usePadPlaying(engine: AudioEngine, padId: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => engine.subscribe(onStoreChange),
    () => engine.isPadPlaying(padId),
  )
}
