import { createContext, useContext, type ReactNode } from 'react'
import type { AudioEngine } from '../engine/AudioEngine'

const EngineContext = createContext<AudioEngine | null>(null)

export function EngineProvider({ engine, children }: { engine: AudioEngine; children: ReactNode }) {
  return <EngineContext value={engine}>{children}</EngineContext>
}

export function useEngine(): AudioEngine {
  const engine = useContext(EngineContext)
  if (!engine) {
    throw new Error('useEngine must be used within an EngineProvider')
  }
  return engine
}
