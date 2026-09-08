import { useRef } from 'react'
import { DRUM_KIT_VOICES } from '../engine/drumSynth'
import { usePadLooping } from '../hooks/usePadLooping'
import { usePadPlaying } from '../hooks/usePadPlaying'
import { useAppState } from '../state/AppStateContext'
import { MAX_PAD_COUNT, MIN_PAD_COUNT } from '../state/constants'
import { useEngine } from '../state/EngineContext'
import { contrastingTextColor } from '../utils/color'
import { drumVoiceIcon, instrumentIcon } from '../utils/instrumentIcon'
import type { AudioEngine } from '../engine/AudioEngine'
import type { Instrument, Pad } from '../state/types'
import { InstrumentModeButton } from './InstrumentModeButton'
import { LoopModeSwitch } from './LoopModeSwitch'
import { MixerModeButton } from './MixerModeButton'
import { PadEffectsMenuButton } from './PadEffectsMenuButton'
import { PadPlaybackModeButton } from './PadPlaybackModeButton'
import { StaticWaveform } from './Waveform'

/** A pad's badge when it holds an instrument key: its 1-based position within that instrument, plus a glyph identifying what it actually is — a specific drum voice for a Drum Kit (kick/snare/hi-hat/... are genuinely different sounds), or the instrument's own single glyph for anything pitched (every key there is literally the same sound, just pitch-shifted). */
interface InstrumentKeyInfo {
  keyNumber: number
  icon: string
}

interface PadGridProps {
  selectedPadId: string | null
  onSelectPad: (padId: string) => void
}

export function PadGrid({ selectedPadId, onSelectPad }: PadGridProps) {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const visiblePads = state.pads.slice(0, state.visiblePadCount)
  const loopModeEnabled = state.transport.padLoopModeEnabled
  const instrumentModeEnabled = state.transport.padInstrumentModeEnabled
  const mixerModeEnabled = state.transport.padMixerModeEnabled
  const playbackMode = state.transport.padPlaybackMode

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
    const isDrumKit = instrument.name === 'Drum Kit'
    instrument.keySampleIds.forEach((sampleId, i) => {
      const icon = isDrumKit ? drumVoiceIcon(DRUM_KIT_VOICES[i]!.kind) : instrumentIcon(instrument)
      sampleKeyInfo.set(sampleId, { keyNumber: i + 1, icon })
    })
  }

  return (
    <section className="panel pad-grid" aria-label="pads">
      <div className="pad-grid-header">
        <h2>Pads ({state.visiblePadCount})</h2>
        <div className="pad-grid-header-controls">
          <button
            type="button"
            className="btn btn-secondary pad-count-button"
            onClick={() => dispatch({ type: 'SET_VISIBLE_PAD_COUNT', count: state.visiblePadCount - 1 })}
            disabled={state.visiblePadCount <= MIN_PAD_COUNT}
            title="Remove the last visible pad (its data is kept)"
            aria-label="Remove last pad"
          >
            − Pad
          </button>
          <button
            type="button"
            className="btn btn-secondary pad-count-button"
            onClick={() => dispatch({ type: 'SET_VISIBLE_PAD_COUNT', count: state.visiblePadCount + 1 })}
            disabled={state.visiblePadCount >= MAX_PAD_COUNT}
            title="Add an empty pad"
          >
            + Pad
          </button>
          <InstrumentModeButton />
          <LoopModeSwitch />
          <MixerModeButton />
          <span className="header-divider" aria-hidden="true" />
          <PadPlaybackModeButton />
          <PadEffectsMenuButton />
        </div>
      </div>
      <div
        className={[
          'pad-grid-cells',
          loopModeEnabled ? 'loop-mode' : '',
          instrumentModeEnabled ? 'instrument-mode' : '',
          mixerModeEnabled ? 'mixer-mode' : '',
        ]
          .filter(Boolean)
          .join(' ')}
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
              instrumentKeyInfo={pad.sampleId ? sampleKeyInfo.get(pad.sampleId) : undefined}
              onSelect={onSelectPad}
            />
          ),
        )}
        {state.visiblePadCount < MAX_PAD_COUNT && (
          <button
            type="button"
            className="pad pad-add-slot"
            onClick={() => dispatch({ type: 'SET_VISIBLE_PAD_COUNT', count: state.visiblePadCount + 1 })}
            aria-label="Add pad"
            title="Add pad"
          >
            <span aria-hidden="true">+</span>
            <small>Add pad</small>
          </button>
        )}
      </div>
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
  instrumentKeyInfo,
  onSelect,
}: PadButtonProps) {
  const { state } = useAppState()
  const looping = usePadLooping(engine, pad.id)
  const playing = usePadPlaying(engine, pad.id)
  const filled = pad.sampleId !== null
  const sample = pad.sampleId ? state.samples[pad.sampleId] : undefined

  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null)

  const stopActiveSource = () => {
    if (!activeSourceRef.current) return
    try {
      activeSourceRef.current.stop()
    } catch {
      // Already ended naturally between the press and this release — nothing to stop.
    }
    activeSourceRef.current = null
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

    if (loopModeEnabled || pad.muted || playbackMode === 'oneshot') return
    // One-shot intentionally waits for the completed click below. Gate begins
    // on press so mouse and touch users can hold the sound open.

    const sample = state.samples[pad.sampleId]
    if (!sample) return
    const source = engine.triggerPad(pad, sample.buffer)
    if (playbackMode === 'gate') activeSourceRef.current = source
  }

  const handlePointerUp = () => {
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

    if (playbackMode === 'gate') stopActiveSource()
  }

  const handlePointerCancel = () => {
    // A dropped gesture (OS interruption, scroll takeover) behaves like a
    // release for gating purposes, but never toggles a loop — an incomplete
    // gesture shouldn't commit to a discrete on/off action.
    if (playbackMode === 'gate') stopActiveSource()
  }

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Gate and Loop have pointer lifecycles for a physical mouse/touch
    // interaction. One-shot is deliberately click-driven; detail 0 is
    // Enter/Space activation, which likewise needs a complete one-shot.
    if (event.detail !== 0 && (loopModeEnabled || playbackMode === 'gate')) return
    onSelect(pad.id)
    if (!pad.sampleId) return

    const sample = state.samples[pad.sampleId]
    if (!sample) return
    if (loopModeEnabled) {
      if (!pad.muted || looping) engine.toggleLoop(pad, sample.buffer)
      return
    }
    if (!pad.muted) engine.triggerPad(pad, sample.buffer)
  }

  return (
    <button
      type="button"
      className={[
        'pad',
        filled ? 'filled' : 'empty',
        selected ? 'selected' : '',
        looping ? 'looping' : '',
        playing ? 'playing' : '',
        pad.muted ? 'muted' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        borderColor: pad.color,
        // Empty pads keep a faint tint of their own color instead of a fully
        // hollow outline — still reads as "nothing assigned" but doesn't look
        // like a blank wireframe.
        background: filled ? pad.color : `${pad.color}1f`,
        color: filled ? contrastingTextColor(pad.color) : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={handleClick}
    >
      {sample && sample.peaks.length > 0 && (
        <span className="pad-waveform-backdrop" aria-hidden="true">
          <StaticWaveform peaks={sample.peaks} color={contrastingTextColor(pad.color)} />
        </span>
      )}
      <span className="pad-index">{index + 1}</span>
      {instrumentKeyInfo && (
        <span className="pad-instrument-badge" aria-hidden="true">
          <span className="pad-instrument-icon">{instrumentKeyInfo.icon}</span>
          {instrumentKeyInfo.keyNumber}
        </span>
      )}
      {!filled && <span className="pad-empty-hint">+</span>}
      {pad.muted && <span className="pad-muted-hint">muted</span>}
      {playing && (
        <span className="pad-eq" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      )}
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
      style={{ borderColor: pad.color }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span
        className="mixer-fader-fill"
        style={{ height: `${pad.mixLevel}%`, background: pad.color }}
        aria-hidden="true"
      />
      <span className="mixer-fader-label">{index + 1}</span>
      {instrumentKeyInfo && (
        <span className="pad-instrument-badge" aria-label={`Instrument key ${instrumentKeyInfo.keyNumber}`}>
          <span className="pad-instrument-icon">{instrumentKeyInfo.icon}</span>
          {instrumentKeyInfo.keyNumber}
        </span>
      )}
      <span className="mixer-fader-level">{pad.mixLevel}%</span>
    </button>
  )
}
