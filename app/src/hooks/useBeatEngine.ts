import { AUDIO_PROFILE } from '../engine/audioProfile'
import { useEffect, useMemo, useRef } from 'react'
import { planPhrasing } from '../engine/phrasing'
import { AudioEngine } from '../engine/AudioEngine'
import { Scheduler } from '../engine/Scheduler'
import type { Action } from '../state/reducer'
import type { AppState } from '../state/types'
import { playablePads } from '../state/banks'
import { buildSongTimeline, sectionBankGain, songStepAt } from '../engine/songTimeline'

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
  const lastSongSectionRef = useRef<string | null>(null)
  const stateRef = useRef(state)
  const playbackPlan = useMemo(() => ({
    timeline: buildSongTimeline(state),
    bankByPad: new Map(state.banks.flatMap((bank) => bank.padIds.map((id) => [id, bank.kind] as const))),
    phrasing: new Map(state.patterns.map((pattern) => [pattern.id, planPhrasing(pattern, state.banks, playablePads(state), state.transport.bpm)])),
  // Only musical edits rebuild the plan; playhead updates do not allocate it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [state.patterns, state.songSections, state.banks, state.pads, state.transport.bpm])
  const planRef = useRef(playbackPlan)
  useEffect(() => {
    stateRef.current = state
    planRef.current = playbackPlan
  }, [state, playbackPlan])

  useEffect(() => {
    const engine = engineRef.current!
    const scheduler = new Scheduler(
      { now: () => engine.getContext().currentTime },
      (stepIndex, time) => {
        const current = stateRef.current
        if (stepIndex % 4 === 0) engine.markBeat(time)
        // The metronome runs off this same lookahead clock so it locks to the same
        // grid as the sequencer whenever both happen to be on, but it's gated on
        // its own toggle, not on whether the pattern itself is playing — see the
        // isPlaying/metronomeEnabled effect below for why the clock keeps running.
        if (current.transport.metronomeEnabled && stepIndex % 4 === 0) {
          engine.playMetronomeClick(time, stepIndex === 0)
        }
        if (!current.transport.isPlaying || !engine.isSequencerPlaybackEnabled()) return
        const plan = planRef.current
        const song = current.transport.playMode === 'song' ? plan.timeline : []
        const auditionSpan = song.find((span) => span.section.id === current.transport.auditionSectionId)
        const songPosition = songStepAt(song, stepIndex)
        const pattern = songPosition?.span.pattern ?? current.patterns.find((p) => p.id === current.activePatternId)
        const patternStep = songPosition?.patternStep ?? stepIndex
        if (songPosition && lastSongSectionRef.current !== songPosition.span.section.id) {
          lastSongSectionRef.current = songPosition.span.section.id
          dispatch({ type: 'SET_CURRENT_SONG_SECTION', sectionId: songPosition.span.section.id })
        }
        engine.markStep(patternStep, time, pattern?.stepCount ?? 16)
        if (pattern) {
          const visiblePads = playablePads(current)
          const bankByPad = plan.bankByPad
          for (const pad of visiblePads) {
            if (pad.muted) continue
            // A programmed cell owns its source reference. The pad may have
            // been reassigned since this step was entered.
            const sampleId = pattern.steps[pad.id]?.[patternStep] ?? null
            if (!sampleId) continue
            const sample = current.samples[sampleId]
            if (!sample) continue
            const bank = bankByPad.get(pad.id)
            const level = songPosition && bank ? sectionBankGain(songPosition.span.section, bank) : 1
            engine.triggerStep(pad, sample.buffer, time, level, plan.phrasing.get(pattern.id)?.get(pad.id)?.[patternStep])
          }
        }
        const finalStep = auditionSpan && current.transport.auditionScope === 'section'
          ? auditionSpan.endStep - 1
          : song.length && current.transport.playMode === 'song'
          ? song[song.length - 1]!.endStep - 1
          : (pattern?.stepCount ?? 16) - 1
        const shouldStop = auditionSpan
          ? current.transport.auditionScope !== 'loop'
          : current.transport.loopMode === 'once'
        if (shouldStop && pattern && stepIndex === finalStep) {
          engine.setSequencerPlaybackEnabled(false)
          dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: false })
        }
      },
      // A phone schedules further ahead, so a main-thread stall doesn't drop hits (see AudioProfile).
      { bpm: state.transport.bpm, scheduleAheadSeconds: AUDIO_PROFILE.scheduleAheadSeconds },
    )
    schedulerRef.current = scheduler
    return () => scheduler.stop()
    // Intentionally created once — reads current state via stateRef, not this closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch])

  useEffect(() => {
    const pattern = state.patterns.find((item) => item.id === state.activePatternId)
    const song = state.transport.playMode === 'song'
      ? buildSongTimeline({ patterns: state.patterns, songSections: state.songSections })
      : []
    const end = song.length ? song[song.length - 1]!.endStep : pattern?.stepCount ?? 16
    const auditionSpan = song.find((span) => span.section.id === state.transport.auditionSectionId)
    schedulerRef.current?.setStepCount(end)
    if (auditionSpan) {
      schedulerRef.current?.setRange(
        auditionSpan.startStep,
        state.transport.auditionScope === 'rest' ? end : auditionSpan.endStep,
      )
    }
  }, [state.activePatternId, state.patterns, state.songSections, state.transport.playMode, state.transport.auditionSectionId, state.transport.auditionScope])

  useEffect(() => {
    schedulerRef.current?.setBpm(state.transport.bpm)
    engineRef.current?.setBpm(state.transport.bpm)
  }, [state.transport.bpm])

  useEffect(() => {
    engineRef.current?.setMasterVolume(state.transport.masterVolume)
  }, [state.transport.masterVolume])

  // Each bank's volume (Mix's one slider) scales its pads' levels, live.
  useEffect(() => {
    for (const bank of state.banks) engineRef.current?.setBankVolume(bank.padIds, bank.volume ?? 100)
  }, [state.banks])

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
  const lastRunIdRef = useRef(state.transport.playbackRunId)
  useEffect(() => {
    const scheduler = schedulerRef.current
    if (!scheduler) return
    const isPlaying = state.transport.isPlaying
    const metronomeEnabled = state.transport.metronomeEnabled
    if (isPlaying && (!wasPlayingRef.current || lastRunIdRef.current !== state.transport.playbackRunId)) {
      lastSongSectionRef.current = null
      dispatch({ type: 'SET_CURRENT_SONG_SECTION', sectionId: null })
      engineRef.current?.setSequencerPlaybackEnabled(true)
      scheduler.stop()
      scheduler.start()
    } else if (isPlaying || metronomeEnabled) {
      scheduler.start() // no-op if the clock is already running
    } else {
      lastSongSectionRef.current = null
      engineRef.current?.setSequencerPlaybackEnabled(false)
      scheduler.stop()
    }
    wasPlayingRef.current = isPlaying
    lastRunIdRef.current = state.transport.playbackRunId
  }, [dispatch, state.transport.isPlaying, state.transport.metronomeEnabled, state.transport.playbackRunId])

  return engineRef.current
}
