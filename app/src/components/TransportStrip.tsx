import { useCallback, useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { useNavigation } from '../state/NavigationContext'
import { playScope } from '../utils/playScope'
import { TempoControl } from './TempoControl'
import { GearIcon, LoopIcon, MetronomeIcon, OnceIcon, PanicIcon, SparkIcon, VolumeIcon } from './icons'

interface TransportStripProps {
  onOpenSettings: () => void
}

/**
 * The always-visible top strip: status and set-and-forget controls — tempo,
 * loop-once vs. continuous, metronome, master level, the Styles drawer,
 * panic stop and settings. Play itself lives in the bottom bar, under the
 * thumb (see PlayButton); this strip is what you glance at, not what you
 * press on every bar.
 */
export function TransportStrip({ onOpenSettings }: TransportStripProps) {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { bpm, loopMode, metronomeEnabled, masterVolume } = state.transport
  const { stylesOpen, setStylesOpen } = useNavigation()
  const [volumeOpen, setVolumeOpen] = useState(false)
  const volumeRef = useRef<HTMLDivElement>(null)
  useDismiss(volumeRef, volumeOpen, useCallback(() => setVolumeOpen(false), []))

  const handlePanic = () => {
    engine.stopAllSounds()
    dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: false })
  }

  const auditioning = Boolean(state.transport.auditionSectionId)
  const sectionLoop = auditioning && state.transport.auditionScope === 'loop'
  const continuous = sectionLoop || (loopMode === 'continuous' && !auditioning)
  const scope = playScope(state)

  return (
    <header className="transport">
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
          className={stylesOpen ? 'icon-btn on' : 'icon-btn'}
          onClick={() => setStylesOpen((open) => !open)}
          aria-label="Styles"
          aria-expanded={stylesOpen}
          title="Styles — drop preset layers into the beat, or start a whole beat"
        >
          <SparkIcon />
        </button>
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
