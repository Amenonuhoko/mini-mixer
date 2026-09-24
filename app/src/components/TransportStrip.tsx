import { useCallback, useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import { BPM_MAX, BPM_MIN } from '../state/constants'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { GearIcon, LoopIcon, MetronomeIcon, OnceIcon, PanicIcon, PlayIcon, StopIcon, VolumeIcon } from './icons'

interface TransportStripProps {
  onOpenSettings: () => void
}

/** Pixels of drag per BPM step when scrubbing the tempo readout. */
const SCRUB_PX_PER_BPM = 4

/**
 * The always-visible top strip: everything about *time* lives here — play,
 * tempo, loop-once vs. continuous, metronome, master level — plus the panic
 * stop and settings. Visible on every page (it used to be a Sequencer-only
 * bottom bar), since tempo and the click matter just as much while playing
 * pads by hand, and a groovebox's transport never moves.
 */
export function TransportStrip({ onOpenSettings }: TransportStripProps) {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { isPlaying, bpm, loopMode, metronomeEnabled, masterVolume } = state.transport
  const [volumeOpen, setVolumeOpen] = useState(false)
  const volumeRef = useRef<HTMLDivElement>(null)
  useDismiss(volumeRef, volumeOpen, useCallback(() => setVolumeOpen(false), []))

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

  const handlePanic = () => {
    engine.stopAllSounds()
    dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: false })
  }

  const auditioning = Boolean(state.transport.auditionSectionId)
  const continuous = loopMode === 'continuous' && !auditioning
  const scope = auditioning ? 'preview' : state.transport.playMode === 'song' ? 'song' : 'pattern'

  return (
    <header className="transport">
      <button
        type="button"
        className={isPlaying ? 'transport-play on' : 'transport-play'}
        onClick={togglePlayback}
        aria-label={isPlaying ? `Stop ${scope}` : `Play ${scope}`}
        title={isPlaying ? `Stop ${scope}` : `Play ${scope}`}
      >
        {isPlaying ? <StopIcon size={20} /> : <PlayIcon size={20} />}
      </button>

      <span className="beat-led" data-beat aria-hidden="true" />

      <BpmControl bpm={bpm} onChange={(next) => dispatch({ type: 'SET_BPM', bpm: next })} />

      <div className="transport-tools">
        <button
          type="button"
          className={continuous ? 'icon-btn on' : 'icon-btn'}
          onClick={() => dispatch({ type: 'SET_LOOP_MODE', loopMode: continuous ? 'once' : 'continuous' })}
          disabled={auditioning}
          aria-pressed={continuous}
          aria-label={auditioning ? 'Preview plays once' : continuous ? `${scope} loops continuously` : `${scope} plays once`}
          title={auditioning ? 'Preview stops at the end' : continuous ? `Loop ${scope} — tap to play once` : `Play ${scope} once — tap to loop`}
        >
          {continuous ? <LoopIcon /> : <OnceIcon />}
        </button>
        <button
          type="button"
          className={metronomeEnabled ? 'icon-btn on' : 'icon-btn'}
          onClick={() => dispatch({ type: 'SET_METRONOME_ENABLED', enabled: !metronomeEnabled })}
          aria-pressed={metronomeEnabled}
          aria-label="Metronome"
          title={metronomeEnabled ? 'Metronome on' : 'Metronome off'}
        >
          <MetronomeIcon />
        </button>
        <div className="popover-anchor" ref={volumeRef}>
          <button
            type="button"
            className={volumeOpen ? 'icon-btn on' : 'icon-btn'}
            onClick={() => setVolumeOpen((open) => !open)}
            aria-expanded={volumeOpen}
            aria-label={`Master volume ${masterVolume}%`}
            title={`Master volume ${masterVolume}%`}
          >
            <VolumeIcon muted={masterVolume === 0} />
          </button>
          {volumeOpen && (
            <div className="popover volume-popover" role="dialog" aria-label="Master volume">
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
        <button
          type="button"
          className="icon-btn danger"
          onClick={handlePanic}
          aria-label="Stop all sounds"
          title="Panic — stop every sound, loop and the sequencer"
        >
          <PanicIcon />
        </button>
        <button type="button" className="icon-btn" onClick={onOpenSettings} aria-label="Settings" title="Settings">
          <GearIcon />
        </button>
      </div>
    </header>
  )
}

interface BpmControlProps {
  bpm: number
  onChange: (bpm: number) => void
}

/**
 * Tempo as a compact readout with nudge buttons — easy to learn (tap − / +)
 * — that also scrubs: drag the number left/right (or up/down) to sweep the
 * tempo fast, or use the arrow keys once it has focus.
 */
function BpmControl({ bpm, onChange }: BpmControlProps) {
  const scrubRef = useRef<{ startX: number; startY: number; startBpm: number } | null>(null)
  const clampBpm = (value: number) => Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(value)))

  const handlePointerDown = (event: React.PointerEvent<HTMLOutputElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    scrubRef.current = { startX: event.clientX, startY: event.clientY, startBpm: bpm }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLOutputElement>) => {
    const scrub = scrubRef.current
    if (!scrub) return
    const travel = event.clientX - scrub.startX - (event.clientY - scrub.startY)
    const next = clampBpm(scrub.startBpm + travel / SCRUB_PX_PER_BPM)
    if (next !== bpm) onChange(next)
  }

  const endScrub = () => {
    scrubRef.current = null
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLOutputElement>) => {
    const step = event.shiftKey ? 10 : 1
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault()
      onChange(clampBpm(bpm + step))
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault()
      onChange(clampBpm(bpm - step))
    }
  }

  return (
    <div className="bpm-control" role="group" aria-label="Tempo">
      <button
        type="button"
        className="bpm-nudge"
        onClick={() => onChange(clampBpm(bpm - 1))}
        disabled={bpm <= BPM_MIN}
        aria-label="Slower"
      >
        −
      </button>
      <output
        className="bpm-readout"
        tabIndex={0}
        role="slider"
        aria-label="Tempo in BPM — drag or use arrow keys"
        aria-valuemin={BPM_MIN}
        aria-valuemax={BPM_MAX}
        aria-valuenow={bpm}
        title="Drag to change tempo"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onKeyDown={handleKeyDown}
      >
        <span className="bpm-value">{bpm}</span>
        <span className="bpm-unit">BPM</span>
      </output>
      <button
        type="button"
        className="bpm-nudge"
        onClick={() => onChange(clampBpm(bpm + 1))}
        disabled={bpm >= BPM_MAX}
        aria-label="Faster"
      >
        +
      </button>
    </div>
  )
}
