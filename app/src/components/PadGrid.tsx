import { useRef, useState, type ReactNode } from 'react'
import { getDrumKitByName, isDrumInstrumentName } from '../engine/drumSynth'
import { usePadLooping } from '../hooks/usePadLooping'
import { useAppState } from '../state/AppStateContext'
import { MAX_PAD_COUNT, MIN_PAD_COUNT } from '../state/constants'
import { useEngine } from '../state/EngineContext'
import { drumVoiceIcon, instrumentIcon } from '../utils/instrumentIcon'
import type { AudioEngine } from '../engine/AudioEngine'
import type { Instrument, Pad } from '../state/types'
import { RecordDotIcon } from './icons'
import { PadEffectsMenuButton } from './PadEffectsMenuButton'
import { PadModeSwitch } from './PadModeSwitch'
import { PadPlaybackModeButton } from './PadPlaybackModeButton'
import { Stepper } from './Stepper'
import { StaticWaveform } from './Waveform'

/** A pad's badge when it holds an instrument key: its 1-based position within that instrument, plus a glyph identifying what it actually is — a specific drum voice for a Drum Kit (kick/snare/hi-hat/... are genuinely different sounds), or the instrument's own single glyph for anything pitched (every key there is literally the same sound, just pitch-shifted). */
interface InstrumentKeyInfo {
  keyNumber: number
  icon: string
}

interface PadGridProps {
  selectedPadId: string | null
  onSelectPad: (padId: string) => void
  /** Rendered at the bottom of the module — the selected pad's action strip (see PadsPage). */
  footer?: ReactNode
}

/**
 * The pad module: a compact header (count, trigger mode, whole-grid FX,
 * sequencer-record arm), the labeled mode switch, the grid, and a footer
 * slot. Every pad is a light: it idles dim, glows with its own audio level,
 * flares on each hit (see LightShow), and breathes with the beat while
 * looping.
 */
export function PadGrid({ selectedPadId, onSelectPad, footer }: PadGridProps) {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const visiblePads = state.pads.slice(0, state.visiblePadCount)
  const loopModeEnabled = state.transport.padLoopModeEnabled
  const instrumentModeEnabled = state.transport.padInstrumentModeEnabled
  const mixerModeEnabled = state.transport.padMixerModeEnabled
  const playbackMode = state.transport.padPlaybackMode
  const [sequencerRecordEnabled, setSequencerRecordEnabled] = useState(false)

  // Which key position (1-based, low to high) each key sample holds within its
  // instrument, plus what to show for it, if any — built once per render
  // rather than searching every instrument per pad. Shown whenever a pad
  // holds one of these keys, regardless of whether instrument mode is
  // currently on, so the grid reads as an ordered keyboard (not identical
  // tiles) as soon as an instrument is applied.
  const sampleKeyInfo = new Map<string, InstrumentKeyInfo>()
  for (const instrumentId of state.instrumentOrder) {
    const instrument = state.instruments[instrumentId] as Instrument | undefined
    if (!instrument) continue
    // The Drum Kit is the one bundled instrument whose keys are genuinely
    // different sounds rather than the same one pitch-shifted — its name is
    // stable (instruments can't be renamed), so this is a safe, permanent check.
    const drumKit = getDrumKitByName(instrument.name)
    const isDrumKit = isDrumInstrumentName(instrument.name)
    instrument.keySampleIds.forEach((sampleId, i) => {
      const icon = isDrumKit ? drumVoiceIcon(drumKit?.voices[i]?.kind ?? 'clap') : instrumentIcon(instrument)
      sampleKeyInfo.set(sampleId, { keyNumber: i + 1, icon })
    })
  }

  return (
    <section className="module pad-grid" aria-label="Pads">
      <header className="module-head">
        <h2 className="module-title">Pads</h2>
        <Stepper
          label="Pads"
          value={String(state.visiblePadCount).padStart(2, '0')}
          onDecrement={() => dispatch({ type: 'SET_VISIBLE_PAD_COUNT', count: state.visiblePadCount - 1 })}
          onIncrement={() => dispatch({ type: 'SET_VISIBLE_PAD_COUNT', count: state.visiblePadCount + 1 })}
          decrementDisabled={state.visiblePadCount <= MIN_PAD_COUNT}
          incrementDisabled={state.visiblePadCount >= MAX_PAD_COUNT}
          decrementTitle="Hide the last pad (its sound and steps are kept)"
          incrementTitle="Add a pad"
        />
        <div className="module-head-tools">
          <PadPlaybackModeButton />
          <PadEffectsMenuButton followPadId={selectedPadId} />
          <button
            type="button"
            className={sequencerRecordEnabled ? 'icon-btn armed' : 'icon-btn'}
            onClick={() => setSequencerRecordEnabled((enabled) => !enabled)}
            aria-pressed={sequencerRecordEnabled}
            aria-label="Record pad hits into the playing sequencer"
            title={
              sequencerRecordEnabled
                ? 'Step record armed — pad hits write into the playing step'
                : 'Arm step record — play pads while the sequence runs to write them in'
            }
          >
            <RecordDotIcon size={14} />
          </button>
        </div>
      </header>
      <PadModeSwitch />
      <div
        className={[
          'pad-grid-cells',
          loopModeEnabled ? 'loop-mode' : '',
          instrumentModeEnabled ? 'instrument-mode' : '',
          mixerModeEnabled ? 'mixer-mode' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        // 3 across up to a 3×3; past that, 4 across (a classic 4×4 at 16).
        style={{ '--cols': state.visiblePadCount > 9 ? 4 : 3 } as React.CSSProperties}
      >
        {visiblePads.map((pad, index) =>
          mixerModeEnabled ? (
            <MixerPadFader
              key={pad.id}
              pad={pad}
              index={index}
              engine={engine}
              instrumentKeyInfo={pad.sampleId ? sampleKeyInfo.get(pad.sampleId) : undefined}
            />
          ) : (
            <PadButton
              key={pad.id}
              pad={pad}
              index={index}
              engine={engine}
              selected={pad.id === selectedPadId}
              loopModeEnabled={loopModeEnabled}
              playbackMode={playbackMode}
              sequencerRecordEnabled={sequencerRecordEnabled}
              instrumentKeyInfo={pad.sampleId ? sampleKeyInfo.get(pad.sampleId) : undefined}
              onSelect={onSelectPad}
            />
          ),
        )}
      </div>
      {footer}
    </section>
  )
}

interface PadButtonProps {
  pad: Pad
  index: number
  engine: AudioEngine
  selected: boolean
  loopModeEnabled: boolean
  playbackMode: 'gate' | 'oneshot'
  /** When armed, pad hits add their sound to the current sequencer step during playback. */
  sequencerRecordEnabled: boolean
  /** Set when this pad's sample is an instrument key — shown as a small badge (see InstrumentKeyInfo). */
  instrumentKeyInfo: InstrumentKeyInfo | undefined
  onSelect: (padId: string) => void
}

/**
 * A pad is one undivided tap target. Its behavior depends on the global loop
 * mode toggle (see LoopModeSwitch): off (the default) — pressing plays the
 * sample and releasing stops it immediately, a gate every time regardless of
 * how long the press was held — hold to let it ring out, release early to
 * cut it short. On — pressing toggles this pad's loop instead, and gating
 * doesn't apply (there's nothing to gate, it's a discrete on/off). Either
 * way, loop and mute stay off the pad face itself — see the selected-pad
 * action bar in PadsPage — this is purely a playback trigger, not a settings
 * surface.
 */
function PadButton({
  pad,
  index,
  engine,
  selected,
  loopModeEnabled,
  playbackMode,
  sequencerRecordEnabled,
  instrumentKeyInfo,
  onSelect,
}: PadButtonProps) {
  const { state, dispatch } = useAppState()
  const looping = usePadLooping(engine, pad.id)
  const filled = pad.sampleId !== null
  const sample = pad.sampleId ? state.samples[pad.sampleId] : undefined

  // A physical input is independently tracked by pointer id. A Map (rather
  // than one source ref) is what lets multiple fingers hold separate pads—or
  // even retrigger the same pad—without one release cutting off another.
  const activeSourcesRef = useRef(new Map<number, AudioBufferSourceNode>())

  const recordCurrentStep = () => {
    if (!sequencerRecordEnabled || !state.transport.isPlaying || !pad.sampleId) return
    dispatch({
      type: 'SET_STEP_SAMPLE',
      patternId: state.activePatternId,
      padId: pad.id,
      stepIndex: state.transport.currentStep,
      sampleId: pad.sampleId,
    })
  }

  const stopActiveSource = (pointerId: number) => {
    const source = activeSourcesRef.current.get(pointerId)
    if (!source) return
    try {
      source.stop()
    } catch {
      // Already ended naturally between the press and this release — nothing to stop.
    }
    activeSourcesRef.current.delete(pointerId)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    onSelect(pad.id)
    if (!pad.sampleId) return
    // Capture so a finger drifting off this small tile mid-press still
    // reports its release here, not to whichever pad it ends up over —
    // pads sit right next to each other, unlike the isolated record FAB.
    // Set for a muted pad too: in loop mode, releasing still needs to be
    // able to stop an already-looping pad even while it's muted.
    event.currentTarget.setPointerCapture(event.pointerId)

    if (loopModeEnabled || pad.muted) return
    // Both Gate and One-shot begin from Pointer Events. Touch browsers only
    // guarantee a synthetic click for the primary finger, whereas pointerdown
    // is delivered independently to every simultaneous finger.
    const sample = state.samples[pad.sampleId]
    if (!sample) return
    recordCurrentStep()
    const source = engine.triggerPad(pad, sample.buffer)
    if (playbackMode === 'gate') activeSourcesRef.current.set(event.pointerId, source)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (loopModeEnabled) {
      if (!pad.sampleId) return
      // Muted blocks starting a new loop, same as a plain tap would, but
      // never blocks stopping one already running — a pad muted mid-loop
      // must still be stoppable.
      if (pad.muted && !looping) return
      const sample = state.samples[pad.sampleId]
      if (!sample) return
      engine.toggleLoop(pad, sample.buffer)
      return
    }

    if (playbackMode === 'gate') stopActiveSource(event.pointerId)
  }

  const handlePointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    // A dropped gesture (OS interruption, scroll takeover) behaves like a
    // release for gating purposes, but never toggles a loop — an incomplete
    // gesture shouldn't commit to a discrete on/off action.
    if (playbackMode === 'gate') stopActiveSource(event.pointerId)
  }

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Physical Gate, Loop, and One-shot presses are fully handled through
    // Pointer Events above. A detail-0 click is keyboard activation, which has
    // no pointer lifecycle and should still trigger one complete audible hit.
    if (event.detail !== 0) return
    onSelect(pad.id)
    if (!pad.sampleId) return

    const sample = state.samples[pad.sampleId]
    if (!sample) return
    if (loopModeEnabled) {
      if (!pad.muted || looping) engine.toggleLoop(pad, sample.buffer)
      return
    }
    if (!pad.muted) {
      recordCurrentStep()
      engine.triggerPad(pad, sample.buffer)
    }
  }

  return (
    <button
      type="button"
      className={[
        'pad',
        filled ? 'filled' : 'empty',
        selected ? 'selected' : '',
        looping ? 'looping' : '',
        pad.muted ? 'muted' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-pad-id={pad.id}
      data-glow-pad={pad.id}
      aria-label={`Pad ${index + 1}${sample ? `: ${sample.label}` : ', empty'}${pad.muted ? ', muted' : ''}${looping ? ', looping' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handlePointerCancel}
      onClick={handleClick}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="pad-glow" aria-hidden="true" />
      <span className="pad-flash" aria-hidden="true" />
      <span className="pad-bloom" aria-hidden="true" />
      {sample && sample.peaks.length > 0 && (
        <span className="pad-wave" aria-hidden="true">
          <StaticWaveform peaks={sample.peaks} />
        </span>
      )}
      <span className="pad-num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      {instrumentKeyInfo && (
        <span className="pad-key" aria-hidden="true">
          <span className="pad-key-icon">{instrumentKeyInfo.icon}</span>
          {instrumentKeyInfo.keyNumber}
        </span>
      )}
      <span className="pad-name" aria-hidden="true">
        {pad.muted ? 'Muted' : sample ? sample.label : '+'}
      </span>
    </button>
  )
}

interface MixerPadFaderProps {
  pad: Pad
  index: number
  engine: AudioEngine
  instrumentKeyInfo: InstrumentKeyInfo | undefined
}

/**
 * Mixer Mode's alternate rendering for a pad tile: a vertical fader instead
 * of a tap target — nothing plays from touching it. Dragging (or just
 * tapping a spot) sets pad.mixLevel from the vertical position within the
 * tile: top is 100 (unity), bottom is 0 (silent). Live-updates a currently-
 * looping pad's actual gain too, the same "dial changes are audible
 * immediately" behavior every other pad dial already has.
 */
function MixerPadFader({ pad, index, engine, instrumentKeyInfo }: MixerPadFaderProps) {
  const { dispatch } = useAppState()
  const looping = usePadLooping(engine, pad.id)
  const draggingRef = useRef(false)

  const levelFromPointer = (event: React.PointerEvent<HTMLButtonElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect()
    const fraction = 1 - (event.clientY - rect.top) / rect.height
    return Math.round(Math.max(0, Math.min(1, fraction)) * 100)
  }

  const applyLevel = (level: number) => {
    dispatch({ type: 'SET_PAD_MIX_LEVEL', padId: pad.id, level })
    if (looping) engine.updateLoopingPadMixLevel(pad.id, level)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    draggingRef.current = true
    applyLevel(levelFromPointer(event))
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return
    applyLevel(levelFromPointer(event))
  }

  const endDrag = () => {
    draggingRef.current = false
  }

  return (
    <button
      type="button"
      className={looping ? 'pad mixer-fader looping' : 'pad mixer-fader'}
      data-pad-id={pad.id}
      data-glow-pad={pad.id}
      aria-label={`Pad ${index + 1} level ${pad.mixLevel}%`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span className="pad-glow" aria-hidden="true" />
      <span className="mixer-fader-fill" style={{ height: `${pad.mixLevel}%` }} aria-hidden="true" />
      <span className="pad-num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      {instrumentKeyInfo && (
        <span className="pad-key" aria-hidden="true">
          <span className="pad-key-icon">{instrumentKeyInfo.icon}</span>
          {instrumentKeyInfo.keyNumber}
        </span>
      )}
      <span className="mixer-fader-level readout" aria-hidden="true">{pad.mixLevel}</span>
    </button>
  )
}
