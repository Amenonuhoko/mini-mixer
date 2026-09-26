import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { playScope } from '../utils/playScope'
import { TempoControl } from './TempoControl'
import { GearIcon, LoopIcon, MetronomeIcon, OnceIcon, PanicIcon, VolumeIcon } from './icons'

interface TransportStripProps {
  onOpenSettings: () => void
}

/**
 * The always-visible top strip: the beat light, tempo and settings (where
 * loop-once vs. continuous also lives). The controls pressed while playing —
 * metronome, master level and panic — sit around Play in the tab bar (see
 * TransportCluster), under the thumb.
 */
export function TransportStrip({ onOpenSettings }: TransportStripProps) {
  const { state, dispatch } = useAppState()
  return (
    <header className="transport">
      <span className="beat-led" data-beat aria-hidden="true" />

      <TempoControl bpm={state.transport.bpm} onChange={(next) => dispatch({ type: 'SET_BPM', bpm: next })} />

      <div className="transport-tools">
        <button type="button" className="icon-btn" onClick={onOpenSettings} aria-label="Settings" title="Settings">
          <GearIcon />
        </button>
      </div>
    </header>
  )
}

/**
 * Play's cluster in the middle of the tab bar: metronome and master level
 * on its left, panic on its right — the transport controls reached for
 * mid-beat, in one pill under the thumb.
 */
export function TransportCluster({ children }: { children: ReactNode }) {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { metronomeEnabled, masterVolume } = state.transport
  const [volumeOpen, setVolumeOpen] = useState(false)
  const volumeRef = useRef<HTMLDivElement>(null)
  useDismiss(volumeRef, volumeOpen, useCallback(() => setVolumeOpen(false), []))

  const handlePanic = () => {
    engine.stopAllSounds()
    dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: false })
  }

  return (
    <div className="transport-cluster" role="group" aria-label="Transport">
      <div className="transport-cluster-side">
      <button
        type="button"
        className={metronomeEnabled ? 'cluster-btn on' : 'cluster-btn'}
        onClick={() => dispatch({ type: 'SET_METRONOME_ENABLED', enabled: !metronomeEnabled })}
        aria-pressed={metronomeEnabled}
        aria-label="Metronome"
        title={metronomeEnabled ? 'Metronome on' : 'Metronome off'}
      >
        <MetronomeIcon size={18} />
      </button>
      <div className="popover-anchor" ref={volumeRef}>
        <button
          type="button"
          className={volumeOpen ? 'cluster-btn on' : 'cluster-btn'}
          onClick={() => setVolumeOpen((open) => !open)}
          aria-expanded={volumeOpen}
          aria-label={`Master volume ${masterVolume}%`}
          title={`Master volume ${masterVolume}%`}
        >
          <VolumeIcon size={18} muted={masterVolume === 0} />
        </button>
        {volumeOpen && (
          <div className="popover popover-up volume-popover" role="dialog" aria-label="Master volume">
            <div className="field-row">
              <span className="label">Master</span>
              <span className="readout">{masterVolume}%</span>
            </div>
            <input
              type="range"
              className="slider"
              style={{ '--fill': `${masterVolume / 100}` } as React.CSSProperties}
              min="0"
              max="100"
              step="1"
              value={masterVolume}
              onChange={(event) => dispatch({ type: 'SET_MASTER_VOLUME', level: Number(event.target.value) })}
              aria-label="Master volume"
              aria-valuetext={`${masterVolume}%`}
              autoFocus
            />
          </div>
        )}
      </div>
      </div>
      {children}
      <div className="transport-cluster-side">
      <button
        type="button"
        className="cluster-btn danger"
        onClick={handlePanic}
        aria-label="Stop all sounds"
        title="Panic — stop every sound, loop and the sequencer"
      >
        <PanicIcon size={18} />
      </button>
      </div>
    </div>
  )
}

/** Loop the pattern or song continuously, or play it once — in Settings. Auditions follow their own rule. */
export function LoopModeSetting() {
  const { state, dispatch } = useAppState()
  const auditioning = Boolean(state.transport.auditionSectionId)
  const sectionLoop = auditioning && state.transport.auditionScope === 'loop'
  const continuous = sectionLoop || (state.transport.loopMode === 'continuous' && !auditioning)
  const scope = playScope(state)
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <span className="label">Playback</span>
        <span className="settings-hint">
          {sectionLoop ? `Looping ${scope} while editing.` : auditioning ? 'A preview plays once, then stops.' : continuous ? `Play loops the ${scope}.` : `Play plays the ${scope} once.`}
        </span>
      </div>
      <div className="segmented" role="radiogroup" aria-label="Playback">
        {([['continuous', 'Loop', LoopIcon], ['once', 'Once', OnceIcon]] as const).map(([mode, label, Icon]) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={(mode === 'continuous') === continuous}
            className={(mode === 'continuous') === continuous ? 'segment on' : 'segment'}
            disabled={auditioning}
            onClick={() => dispatch({ type: 'SET_LOOP_MODE', loopMode: mode })}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
    </div>
  )
}
