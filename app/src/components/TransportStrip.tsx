import { useCallback, useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { TempoControl } from './TempoControl'
import { GearIcon, LoopIcon, MetronomeIcon, OnceIcon, PanicIcon, PlayIcon, StopIcon, VolumeIcon } from './icons'

interface TransportStripProps {
  onOpenSettings: () => void
}

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
  const sectionLoop = auditioning && state.transport.auditionScope === 'loop'
  const editingSection = state.songSections.find((section) => section.id === state.transport.auditionSectionId)
  const continuous = sectionLoop || (loopMode === 'continuous' && !auditioning)
  const scope = sectionLoop
    ? `${editingSection?.name || 'section'} section`
    : auditioning ? 'preview' : state.transport.playMode === 'song' ? 'song' : 'pattern'

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

      <TempoControl bpm={bpm} onChange={(next) => dispatch({ type: 'SET_BPM', bpm: next })} />

      <div className="transport-tools">
        <button
          type="button"
          className={continuous ? 'icon-btn on' : 'icon-btn'}
          onClick={() => dispatch({ type: 'SET_LOOP_MODE', loopMode: continuous ? 'once' : 'continuous' })}
          disabled={auditioning}
          aria-pressed={continuous}
          aria-label={sectionLoop ? `${scope} loops continuously` : auditioning ? 'Preview plays once' : continuous ? `${scope} loops continuously` : `${scope} plays once`}
          title={sectionLoop ? `Looping ${scope} while editing` : auditioning ? 'Preview stops at the end' : continuous ? `Loop ${scope} — tap to play once` : `Play ${scope} once — tap to loop`}
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
