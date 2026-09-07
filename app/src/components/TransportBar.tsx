import { useState } from 'react'
import { BPM_MAX, BPM_MIN } from '../state/constants'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'

export function TransportBar() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const [confirmClear, setConfirmClear] = useState(false)

  const handleClearAll = () => {
    engine.stopAll()
    dispatch({ type: 'CLEAR_ALL' })
    setConfirmClear(false)
  }

  return (
    <section className="panel transport" aria-label="transport">
      <div className="transport-row">
        <button
          type="button"
          className="play-toggle"
          onClick={() =>
            dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: !state.transport.isPlaying })
          }
        >
          {state.transport.isPlaying ? 'Pause' : 'Play'}
        </button>

        <label>
          <input
            type="checkbox"
            checked={state.transport.loopMode === 'continuous'}
            onChange={(event) =>
              dispatch({
                type: 'SET_LOOP_MODE',
                loopMode: event.target.checked ? 'continuous' : 'once',
              })
            }
          />
          Loop continuously
        </label>
      </div>

      <div className="transport-row">
        <label htmlFor="bpm">
          BPM: {state.transport.bpm} ({BPM_MIN}-{BPM_MAX})
        </label>
        <input
          id="bpm"
          type="range"
          min={BPM_MIN}
          max={BPM_MAX}
          value={state.transport.bpm}
          onChange={(event) => dispatch({ type: 'SET_BPM', bpm: Number(event.target.value) })}
        />
      </div>

      <div className="transport-row">
        <label htmlFor="pad-count">Pad count: {state.visiblePadCount}</label>
        <input
          id="pad-count"
          type="range"
          min={1}
          max={16}
          value={state.visiblePadCount}
          onChange={(event) =>
            dispatch({ type: 'SET_VISIBLE_PAD_COUNT', count: Number(event.target.value) })
          }
        />
      </div>

      <div className="transport-row">
        {confirmClear ? (
          <>
            <span>Clear everything — recordings, pads, pattern?</span>
            <button type="button" onClick={handleClearAll}>
              Yes, clear all
            </button>
            <button type="button" onClick={() => setConfirmClear(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmClear(true)}>
            Clear All
          </button>
        )}
      </div>
    </section>
  )
}
