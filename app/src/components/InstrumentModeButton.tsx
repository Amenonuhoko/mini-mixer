import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import { instrumentIcon } from '../utils/instrumentIcon'
import type { Instrument } from '../state/types'

/**
 * The pad grid's other mode switch, alongside LoopModeButton — mutually
 * exclusive with it (see reducer.ts). Turning it on always asks which
 * instrument to lay across the pads first; there's no "just flip it on with
 * whatever was there before" — the point of the mode is that you deliberately
 * chose an instrument to play. Once on, holding the record FAB captures a
 * performance instead of the microphone (see RecordFAB).
 */
export function InstrumentModeButton() {
  const { state, dispatch } = useAppState()
  const { padInstrumentModeEnabled } = state.transport
  const [picking, setPicking] = useState(false)
  const [confirmInstrumentId, setConfirmInstrumentId] = useState<string | null>(null)

  const instruments = state.instrumentOrder
    .map((id) => state.instruments[id])
    .filter((instrument): instrument is Instrument => instrument !== undefined)
  const anyPadFilled = state.pads
    .slice(0, state.visiblePadCount)
    .some((pad) => pad.sampleId !== null)

  const handleToggle = () => {
    if (padInstrumentModeEnabled) {
      dispatch({ type: 'SET_PAD_INSTRUMENT_MODE_ENABLED', enabled: false })
      return
    }
    if (instruments.length === 0) return
    setPicking(true)
  }

  const applyInstrument = (instrumentId: string) => {
    dispatch({ type: 'APPLY_INSTRUMENT_TO_PADS', instrumentId })
    dispatch({ type: 'SET_PAD_INSTRUMENT_MODE_ENABLED', enabled: true })
    setPicking(false)
    setConfirmInstrumentId(null)
  }

  const handlePick = (instrumentId: string) => {
    if (anyPadFilled) {
      setConfirmInstrumentId(instrumentId)
    } else {
      applyInstrument(instrumentId)
    }
  }

  const closePicker = () => {
    setPicking(false)
    setConfirmInstrumentId(null)
  }

  return (
    <>
      <button
        type="button"
        className={padInstrumentModeEnabled ? 'instrument-mode-fab on' : 'instrument-mode-fab'}
        onClick={handleToggle}
        disabled={!padInstrumentModeEnabled && instruments.length === 0}
        aria-pressed={padInstrumentModeEnabled}
        aria-label="Toggle instrument mode"
        title={
          instruments.length === 0
            ? 'Build an instrument in the Library first'
            : padInstrumentModeEnabled
              ? 'Instrument mode on — hold Record to capture a performance'
              : 'Instrument mode off — turn on to lay an instrument across the pads'
        }
      >
        <PianoKeysIcon />
      </button>

      {picking && (
        <div className="overlay-backdrop" onClick={closePicker}>
          <div className="overlay-sheet" onClick={(event) => event.stopPropagation()}>
            <h2>Choose an instrument</h2>
            <p className="muted">Lays its keys across the pads — Pad 1 gets the lowest note.</p>
            <ul className="instrument-picker-list">
              {instruments.map((instrument) => (
                <li key={instrument.id}>
                  <button
                    type="button"
                    className="btn btn-secondary instrument-picker-btn"
                    onClick={() => handlePick(instrument.id)}
                  >
                    <span aria-hidden="true">{instrumentIcon(instrument)}</span>
                    {instrument.name}
                  </button>
                </li>
              ))}
            </ul>
            {confirmInstrumentId && (
              <div className="confirm-overwrite">
                <span>Replace every pad's current sound with this instrument?</span>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => applyInstrument(confirmInstrumentId)}
                >
                  Apply
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setConfirmInstrumentId(null)}
                >
                  Cancel
                </button>
              </div>
            )}
            <button type="button" className="btn btn-secondary overlay-close" onClick={closePicker}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function PianoKeysIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 6v7M13 6v7M17 6v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
