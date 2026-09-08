import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import { Overlay } from './Overlay'

type GridMode = 'off' | 'loop' | 'instrument' | 'mixer'

/**
 * FAB for the pad-grid modes that need more than a flip of a switch —
 * currently just Mixer Mode. Loop Mode and Instrument Mode used to live here
 * too, but each earned its own dedicated always-visible control on the Pads
 * panel header instead (LoopModeSwitch, InstrumentModeButton) once it became
 * clear each was reached for often enough that a two-tap "open menu, then
 * pick X" was more friction than it deserved. The FAB's own icon still
 * reflects whichever mode is actually active — Loop or Instrument included —
 * even though neither is selectable from this menu anymore, so it's clear at
 * a glance why Mixer Mode (the one thing left here) is unavailable right
 * now. All three stay mutually exclusive at the reducer level regardless of
 * which control flips them.
 */
export function GridModeButton() {
  const { state, dispatch } = useAppState()
  const { padLoopModeEnabled, padInstrumentModeEnabled, padMixerModeEnabled } = state.transport
  const [menuOpen, setMenuOpen] = useState(false)

  const mode: GridMode = padLoopModeEnabled
    ? 'loop'
    : padInstrumentModeEnabled
      ? 'instrument'
      : padMixerModeEnabled
        ? 'mixer'
        : 'off'

  const turnOff = () => {
    if (padInstrumentModeEnabled) dispatch({ type: 'SET_PAD_INSTRUMENT_MODE_ENABLED', enabled: false })
    if (padMixerModeEnabled) dispatch({ type: 'SET_PAD_MIXER_MODE_ENABLED', enabled: false })
    setMenuOpen(false)
  }

  const turnOnMixer = () => {
    dispatch({ type: 'SET_PAD_MIXER_MODE_ENABLED', enabled: true })
    setMenuOpen(false)
  }

  const closeAll = () => {
    setMenuOpen(false)
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
            ? 'Loop mode is on (see the switch on the Pads panel)'
            : mode === 'instrument'
              ? 'Instrument mode is on (see the instrument button on the Pads panel)'
              : mode === 'mixer'
                ? 'Mixer mode — pads are volume faders'
                : 'Pad grid mode — tap to change how pads behave'
        }
      >
        {mode === 'loop' ? (
          <LoopIcon />
        ) : mode === 'instrument' ? (
          <PianoKeysIcon />
        ) : mode === 'mixer' ? (
          <SlidersIcon />
        ) : (
          <GridIcon />
        )}
      </button>

      {menuOpen && (
        <Overlay onClose={closeAll}>
          <h2>Pad grid mode</h2>
          {mode === 'loop' && (
            <p className="muted">
              Loop mode is on right now (see the switch on the Pads panel) — turn it off there to
              use this instead.
            </p>
          )}
          {mode === 'instrument' && (
            <p className="muted">
              Instrument mode is on right now (see the instrument button on the Pads panel) — turn
              it off there to use this instead.
            </p>
          )}
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
                className={mode === 'mixer' ? 'btn btn-secondary mode-menu-btn current' : 'btn btn-secondary mode-menu-btn'}
                onClick={turnOnMixer}
              >
                <span className="mode-menu-title">Mixer Mode</span>
                <span className="muted">Pads become drag-to-set volume faders</span>
              </button>
            </li>
          </ul>
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

function SlidersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M5 19V13M5 9V5M12 19V11M12 7V5M19 19V15M19 11V5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="5" cy="11" r="2" fill="currentColor" />
      <circle cx="12" cy="9" r="2" fill="currentColor" />
      <circle cx="19" cy="13" r="2" fill="currentColor" />
    </svg>
  )
}
