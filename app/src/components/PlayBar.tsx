import { BPM_MAX, BPM_MIN } from '../state/constants'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'

/**
 * Fixed to the bottom of the viewport so play/pause and tempo stay reachable
 * with a thumb while scrolling through pads/dials/sequencer on a phone —
 * the controls you touch constantly shouldn't require scrolling back up to.
 * The metronome used to live here too, but it's a global utility independent
 * of play/pause (see useBeatEngine) — it now lives beside the record FAB
 * instead, alongside MetronomeButton.tsx.
 */
export function PlayBar() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { isPlaying, bpm, loopMode } = state.transport

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
    <div className="play-bar">
      <button
        type="button"
        className={isPlaying ? 'play-toggle playing' : 'play-toggle'}
        onClick={togglePlayback}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div className="play-bar-bpm">
        <input
          id="bpm"
          type="range"
          min={BPM_MIN}
          max={BPM_MAX}
          value={bpm}
          onChange={(event) => dispatch({ type: 'SET_BPM', bpm: Number(event.target.value) })}
          aria-label="Tempo"
        />
        <label htmlFor="bpm">{bpm} BPM</label>
      </div>

      <button
        type="button"
        className={loopMode === 'continuous' ? 'loop-mode-btn on' : 'loop-mode-btn'}
        onClick={() =>
          dispatch({
            type: 'SET_LOOP_MODE',
            loopMode: loopMode === 'continuous' ? 'once' : 'continuous',
          })
        }
        aria-pressed={loopMode === 'continuous'}
        aria-label="Toggle loop continuously vs. play once"
        title={
          loopMode === 'continuous'
            ? 'Looping continuously — tap for play once'
            : 'Plays once — tap to loop'
        }
      >
        <LoopIcon />
      </button>
    </div>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M7 5.5v13l11-6.5-11-6.5z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  )
}

function LoopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M4 12a8 8 0 0 1 13.66-5.66L20 8M20 8V3M20 8h-5M20 12a8 8 0 0 1-13.66 5.66L4 16M4 16v5M4 16h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
