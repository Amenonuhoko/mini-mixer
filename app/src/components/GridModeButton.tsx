import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import { instrumentIcon } from '../utils/instrumentIcon'
import type { Instrument } from '../state/types'
import { Overlay } from './Overlay'

type GridMode = 'off' | 'loop' | 'instrument'

/**
 * Single FAB for both pad-grid modes (loop, instrument) — previously two
 * separate floating buttons, which pushed the FAB cluster wide enough to
 * cover the Pads-page action bar underneath it. One button opens a small
 * "pick a mode" menu instead; picking Instrument Mode from there flows
 * straight into the existing "choose an instrument" picker. The two modes
 * stay mutually exclusive at the reducer level (see SET_PAD_LOOP_MODE_ENABLED
 * / SET_PAD_INSTRUMENT_MODE_ENABLED) — this is just a UI consolidation.
 */
export function GridModeButton() {
  const { state, dispatch } = useAppState()
  const { padLoopModeEnabled, padInstrumentModeEnabled } = state.transport
  const [menuOpen, setMenuOpen] = useState(false)
  const [pickingInstrument, setPickingInstrument] = useState(false)
  const [confirmInstrumentId, setConfirmInstrumentId] = useState<string | null>(null)

  const mode: GridMode = padLoopModeEnabled ? 'loop' : padInstrumentModeEnabled ? 'instrument' : 'off'
  const instruments = state.instrumentOrder
    .map((id) => state.instruments[id])
    .filter((instrument): instrument is Instrument => instrument !== undefined)
  const anyPadFilled = state.pads
    .slice(0, state.visiblePadCount)
    .some((pad) => pad.sampleId !== null)

  const turnOff = () => {
    if (padLoopModeEnabled) dispatch({ type: 'SET_PAD_LOOP_MODE_ENABLED', enabled: false })
    if (padInstrumentModeEnabled) dispatch({ type: 'SET_PAD_INSTRUMENT_MODE_ENABLED', enabled: false })
    setMenuOpen(false)
  }

  const turnOnLoop = () => {
    dispatch({ type: 'SET_PAD_LOOP_MODE_ENABLED', enabled: true })
    setMenuOpen(false)
  }

  const openInstrumentPicker = () => {
    if (instruments.length === 0) return
    setMenuOpen(false)
    setPickingInstrument(true)
  }

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
    setMenuOpen(false)
    setPickingInstrument(false)
    setConfirmInstrumentId(null)
  }

  return (
    <>
      <button
        type="button"
        className={mode === 'off' ? 'grid-mode-fab' : 'grid-mode-fab on'}
        onClick={() => setMenuOpen(true)}
        aria-label="Pad grid mode"
        title={
          mode === 'loop'
            ? 'Loop mode — tapping a pad toggles its loop'
            : mode === 'instrument'
              ? 'Instrument mode — hold Record to capture a performance'
              : 'Pad grid mode — tap to change how pads behave'
        }
      >
        {mode === 'loop' ? <LoopIcon /> : mode === 'instrument' ? <PianoKeysIcon /> : <GridIcon />}
      </button>

      {menuOpen && (
        <Overlay onClose={closeAll}>
          <h2>Pad grid mode</h2>
          <ul className="mode-menu-list">
            <li>
              <button
                type="button"
                className={mode === 'off' ? 'btn btn-secondary mode-menu-btn current' : 'btn btn-secondary mode-menu-btn'}
                onClick={turnOff}
              >
                <span className="mode-menu-title">Off</span>
                <span className="muted">Tap a pad to play it, hold to gate</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={mode === 'loop' ? 'btn btn-secondary mode-menu-btn current' : 'btn btn-secondary mode-menu-btn'}
                onClick={turnOnLoop}
              >
                <span className="mode-menu-title">Loop Mode</span>
                <span className="muted">Tap a pad to toggle its loop</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={mode === 'instrument' ? 'btn btn-secondary mode-menu-btn current' : 'btn btn-secondary mode-menu-btn'}
                onClick={openInstrumentPicker}
                disabled={instruments.length === 0}
              >
                <span className="mode-menu-title">Instrument Mode</span>
                <span className="muted">
                  {instruments.length === 0
                    ? 'Build an instrument in the Library first'
                    : 'Choose an instrument to lay across the pads'}
                </span>
              </button>
            </li>
          </ul>
          <button type="button" className="btn btn-secondary overlay-close" onClick={closeAll}>
            Cancel
          </button>
        </Overlay>
      )}

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

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function LoopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
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

function PianoKeysIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 6v7M13 6v7M17 6v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
