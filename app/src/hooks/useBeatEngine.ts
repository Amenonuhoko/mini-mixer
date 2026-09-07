import { useEffect, useRef } from 'react'
import { AudioEngine } from '../engine/AudioEngine'
import { Scheduler } from '../engine/Scheduler'
import { STEP_COUNT } from '../state/constants'
import type { Action } from '../state/reducer'
import type { AppState } from '../state/types'

/**
 * Owns the single AudioEngine + Scheduler pair for the app's lifetime and keeps
 * the scheduler's step callback reading fresh state via a ref, so the scheduler
 * itself is never torn down and rebuilt on every state change (that would glitch
 * playback timing, defeating the point of the lookahead scheduler).
 */
export function useBeatEngine(state: AppState, dispatch: React.Dispatch<Action>): AudioEngine {
  const engineRef = useRef<AudioEngine | null>(null)
  engineRef.current ??= new AudioEngine()

  const schedulerRef = useRef<Scheduler | null>(null)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const engine = engineRef.current!
    const scheduler = new Scheduler(
      { now: () => engine.getContext().currentTime },
      (stepIndex, time) => {
        const current = stateRef.current
        const pattern = current.patterns.find((p) => p.id === current.activePatternId)
        if (pattern) {
          const visiblePads = current.pads.slice(0, current.visiblePadCount)
          for (const pad of visiblePads) {
            if (pad.muted) continue
            const isOn = pattern.steps[pad.id]?.[stepIndex] ?? false
            if (!isOn || !pad.sampleId) continue
            const sample = current.samples[pad.sampleId]
            if (!sample) continue
            engine.triggerStep(pad, sample.buffer, time)
          }
        }
        // Metronome clicks on quarter notes (every 4th step of the 16-step grid),
        // accented on the downbeat (step 0).
        if (current.transport.metronomeEnabled && stepIndex % 4 === 0) {
          engine.playMetronomeClick(time, stepIndex === 0)
        }
        dispatch({ type: 'SET_CURRENT_STEP', stepIndex })
        if (current.transport.loopMode === 'once' && stepIndex === STEP_COUNT - 1) {
          scheduler.stop()
          dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: false })
        }
      },
      { bpm: state.transport.bpm },
    )
    schedulerRef.current = scheduler
    return () => scheduler.stop()
    // Intentionally created once — reads current state via stateRef, not this closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch])

  useEffect(() => {
    schedulerRef.current?.setBpm(state.transport.bpm)
  }, [state.transport.bpm])

  useEffect(() => {
    if (state.transport.isPlaying) {
      schedulerRef.current?.start()
    } else {
      schedulerRef.current?.stop()
    }
  }, [state.transport.isPlaying])

  return engineRef.current
}
