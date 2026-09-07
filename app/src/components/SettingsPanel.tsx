import { useState } from 'react'
import { MAX_PAD_COUNT, MIN_PAD_COUNT } from '../state/constants'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'

/** Less-frequently-touched controls — pad count and Clear All — kept out of the sticky PlayBar. */
export function SettingsPanel() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const [confirmClear, setConfirmClear] = useState(false)

  const handleClearAll = () => {
    engine.stopAll()
    dispatch({ type: 'CLEAR_ALL' })
    setConfirmClear(false)
  }

  const setPadCount = (count: number) => dispatch({ type: 'SET_VISIBLE_PAD_COUNT', count })

  return (
    <section className="panel settings" aria-label="settings">
      <h2>Settings</h2>

      <div className="settings-row">
        <span className="settings-label">Pad count</span>
        <div className="stepper">
          <button
            type="button"
            className="stepper-btn"
            onClick={() => setPadCount(state.visiblePadCount - 1)}
            disabled={state.visiblePadCount <= MIN_PAD_COUNT}
            aria-label="Fewer pads"
          >
            −
          </button>
          <span className="stepper-value">{state.visiblePadCount}</span>
          <button
            type="button"
            className="stepper-btn"
            onClick={() => setPadCount(state.visiblePadCount + 1)}
            disabled={state.visiblePadCount >= MAX_PAD_COUNT}
            aria-label="More pads"
          >
            +
          </button>
        </div>
      </div>

      {confirmClear ? (
        <div className="confirm-overwrite">
          <span>Clear everything — recordings, pads, pattern?</span>
          <button type="button" className="btn btn-danger" onClick={handleClearAll}>
            Yes, clear all
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setConfirmClear(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setConfirmClear(true)}>
          Clear All
        </button>
      )}
    </section>
  )
}
