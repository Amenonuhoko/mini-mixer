import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'

/**
 * A persistent output-level control beside Metronome. This is intentionally
 * separate from pad Mixer Mode: pad faders balance sources within a beat,
 * while this slider changes the final listening level for everything.
 */
export function MasterVolumeButton() {
  const { state, dispatch } = useAppState()
  const [open, setOpen] = useState(false)
  const level = state.transport.masterVolume

  return (
    <div className="master-volume-control">
      <button
        type="button"
        className={level === 0 ? 'master-volume-fab muted' : 'master-volume-fab'}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        aria-controls="master-volume-panel"
        aria-label={`Master volume: ${level}%`}
        title={`Master volume: ${level}%`}
      >
        <VolumeIcon muted={level === 0} />
      </button>
      {open && (
        <div id="master-volume-panel" className="master-volume-panel">
          <label htmlFor="master-volume-range">
            <span>Master volume</span>
            <strong>{level}%</strong>
          </label>
          <input
            id="master-volume-range"
            type="range"
            min="0"
            max="100"
            step="1"
            value={level}
            onChange={(event) =>
              dispatch({ type: 'SET_MASTER_VOLUME', level: Number(event.target.value) })
            }
            aria-valuetext={`${level}%`}
          />
        </div>
      )}
    </div>
  )
}

function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      {muted ? (
        <path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M17 9a4.5 4.5 0 0 1 0 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  )
}
