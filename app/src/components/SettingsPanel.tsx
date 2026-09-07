import { useState } from 'react'
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

  return (
    <section className="panel settings" aria-label="settings">
      <h2>Settings</h2>

      <div className="settings-row">
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
