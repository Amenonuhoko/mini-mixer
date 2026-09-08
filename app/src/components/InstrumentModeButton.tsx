import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import { instrumentIcon } from '../utils/instrumentIcon'
import type { Instrument } from '../state/types'
import { Overlay } from './Overlay'

/**
 * Dedicated icon button for Instrument Mode, top-right of the Pads panel
 * header alongside LoopModeSwitch and PadEffectsMenuButton — pulled out of
 * GridModeButton's menu since, like Loop Mode before it, it's reached for
 * often enough that a two-tap "open menu, then pick Instrument Mode" was more
 * friction than it deserved. Unlike Loop Mode's switch this isn't a bare
 * on/off flip: turning it on always has to ask "which instrument?" first
 * (there's no implicit "whatever was there before"), so tapping this while
 * off opens the instrument picker, while tapping it while on turns it off
 * directly — nothing left to ask at that point.
 */
export function InstrumentModeButton() {
  const { state, dispatch } = useAppState()
  const enabled = state.transport.padInstrumentModeEnabled
  const [pickingInstrument, setPickingInstrument] = useState(false)
  const [confirmInstrumentId, setConfirmInstrumentId] = useState<string | null>(null)

  const instruments = state.instrumentOrder
    .map((id) => state.instruments[id])
    .filter((instrument): instrument is Instrument => instrument !== undefined)
  const anyPadFilled = state.pads
    .slice(0, state.visiblePadCount)
    .some((pad) => pad.sampleId !== null)

  const applyInstrument = (instrumentId: string) => {
    dispatch({ type: 'APPLY_INSTRUMENT_TO_PADS', instrumentId })
    dispatch({ type: 'SET_PAD_INSTRUMENT_MODE_ENABLED', enabled: true })
    setPickingInstrument(false)
    setConfirmInstrumentId(null)
  }

  const handlePickInstrument = (instrumentId: string) => {
    if (anyPadFilled) {
      setConfirmInstrumentId(instrumentId)
    } else {
      applyInstrument(instrumentId)
    }
  }

  const closeAll = () => {
    setPickingInstrument(false)
    setConfirmInstrumentId(null)
  }

  const handleClick = () => {
    if (enabled) {
      dispatch({ type: 'SET_PAD_INSTRUMENT_MODE_ENABLED', enabled: false })
    } else {
      setPickingInstrument(true)
    }
  }

  return (
    <>
      <button
        type="button"
        className={enabled ? 'instrument-mode-btn on' : 'instrument-mode-btn'}
        onClick={handleClick}
        disabled={!enabled && instruments.length === 0}
        aria-pressed={enabled}
        aria-label="Instrument Mode"
        title={
          enabled
            ? 'Instrument Mode is on — tap to turn off'
            : instruments.length === 0
              ? 'Build an instrument in the Library first'
              : 'Instrument Mode — choose an instrument to lay across the pads'
        }
      >
        <PianoKeysIcon />
      </button>

      {pickingInstrument && (
        <Overlay onClose={closeAll}>
          <h2>Choose an instrument</h2>
          <p className="muted">Lays its keys across the pads — Pad 1 gets the lowest note.</p>
          <ul className="instrument-picker-list">
            {instruments.map((instrument) => (
              <li key={instrument.id}>
                <button
                  type="button"
                  className="btn btn-secondary instrument-picker-btn"
                  onClick={() => handlePickInstrument(instrument.id)}
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
          <button type="button" className="btn btn-secondary overlay-close" onClick={closeAll}>
            Cancel
          </button>
        </Overlay>
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
