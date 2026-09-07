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
        // The metronome runs off this same lookahead clock so it locks to the same
        // grid as the sequencer whenever both happen to be on, but it's gated on
        // its own toggle, not on whether the pattern itself is playing — see the
        // isPlaying/metronomeEnabled effect below for why the clock keeps running.
        if (current.transport.metronomeEnabled && stepIndex % 4 === 0) {
          engine.playMetronomeClick(time, stepIndex === 0)
        }
        if (!current.transport.isPlaying) return
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
        dispatch({ type: 'SET_CURRENT_STEP', stepIndex })
        if (current.transport.loopMode === 'once' && stepIndex === STEP_COUNT - 1) {
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

  // The lookahead clock itself runs whenever *either* the sequencer is playing or
  // the metronome is on — the metronome toggle starts/stops it independently of
  // the play/pause button, per its own explicit control, while still sharing one
  // clock with the sequencer so the two never drift out of phase when both are on.
  // A fresh press of Play always (re)starts the clock at step 0 — even if the
  // metronome was already ticking on its own — so the pattern reliably begins at
  // its first step every time, resyncing the metronome's phase to that downbeat
  // as a side effect. Toggling the metronome mid-playback, or pausing while it
  // stays on, must NOT restart the clock, or it'd glitch the running pattern —
  // wasPlayingRef exists solely to tell "just pressed play" apart from those.
  const wasPlayingRef = useRef(false)
  useEffect(() => {
    const scheduler = schedulerRef.current
    if (!scheduler) return
    const isPlaying = state.transport.isPlaying
    const metronomeEnabled = state.transport.metronomeEnabled
    if (isPlaying && !wasPlayingRef.current) {
      scheduler.stop()
      scheduler.start()
    } else if (isPlaying || metronomeEnabled) {
      scheduler.start() // no-op if the clock is already running
    } else {
      scheduler.stop()
    }
    wasPlayingRef.current = isPlaying
  }, [state.transport.isPlaying, state.transport.metronomeEnabled])

  return engineRef.current
}
