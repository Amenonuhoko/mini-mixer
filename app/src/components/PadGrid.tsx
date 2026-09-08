import { useRef } from 'react'
import { usePadLooping } from '../hooks/usePadLooping'
import { usePadPlaying } from '../hooks/usePadPlaying'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { contrastingTextColor } from '../utils/color'
import type { AudioEngine } from '../engine/AudioEngine'
import type { Instrument, Pad } from '../state/types'
import { InstrumentModeButton } from './InstrumentModeButton'
import { LoopModeSwitch } from './LoopModeSwitch'
import { PadEffectsMenuButton } from './PadEffectsMenuButton'
import { StaticWaveform } from './Waveform'

interface PadGridProps {
  selectedPadId: string | null
  onSelectPad: (padId: string) => void
}

export function PadGrid({ selectedPadId, onSelectPad }: PadGridProps) {
  const { state } = useAppState()
  const engine = useEngine()
  const visiblePads = state.pads.slice(0, state.visiblePadCount)
  const loopModeEnabled = state.transport.padLoopModeEnabled
  const instrumentModeEnabled = state.transport.padInstrumentModeEnabled
  const mixerModeEnabled = state.transport.padMixerModeEnabled

  // Which key position (1-based, low to high) each key sample holds within its
  // instrument, if any — built once per render rather than searching every
  // instrument per pad. Shown whenever a pad holds one of these keys, regardless
  // of whether instrument mode is currently on, so the grid reads as an ordered
  // keyboard (not identical tiles) as soon as an instrument is applied.
  const sampleKeyNumbers = new Map<string, number>()
  for (const instrumentId of state.instrumentOrder) {
    const instrument = state.instruments[instrumentId] as Instrument | undefined
    if (!instrument) continue
    instrument.keySampleIds.forEach((sampleId, i) => sampleKeyNumbers.set(sampleId, i + 1))
  }

  return (
    <section className="panel pad-grid" aria-label="pads">
      <div className="pad-grid-header">
        <h2>Pads ({state.visiblePadCount})</h2>
        <div className="pad-grid-header-controls">
          <InstrumentModeButton />
          <LoopModeSwitch />
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
            <MixerPadFader key={pad.id} pad={pad} index={index} engine={engine} />
          ) : (
            <PadButton
              key={pad.id}
              pad={pad}
              index={index}
              engine={engine}
              selected={pad.id === selectedPadId}
              loopModeEnabled={loopModeEnabled}
              instrumentKeyNumber={pad.sampleId ? sampleKeyNumbers.get(pad.sampleId) : undefined}
              onSelect={onSelectPad}
            />
          ),
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
  /** Set to the key's 1-based position (low to high) when this pad's sample is an instrument key — shown as a small badge. */
  instrumentKeyNumber: number | undefined
  onSelect: (padId: string) => void
}

/**
 * A pad is one undivided tap target. Its behavior depends on the global loop
 * mode toggle (see GridModeButton): off (the default) — pressing plays the
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
  instrumentKeyNumber,
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

    if (loopModeEnabled || pad.muted) return // nothing to trigger/gate here

    const sample = state.samples[pad.sampleId]
    if (!sample) return
    activeSourceRef.current = engine.triggerPad(pad, sample.buffer)
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

    stopActiveSource()
  }

  const handlePointerCancel = () => {
    // A dropped gesture (OS interruption, scroll takeover) behaves like a
    // release for gating purposes, but never toggles a loop — an incomplete
    // gesture shouldn't commit to a discrete on/off action.
    stopActiveSource()
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
    >
      {sample && sample.peaks.length > 0 && (
        <span className="pad-waveform-backdrop" aria-hidden="true">
          <StaticWaveform peaks={sample.peaks} color={contrastingTextColor(pad.color)} />
        </span>
      )}
      <span className="pad-index">{index + 1}</span>
      {instrumentKeyNumber !== undefined && (
        <span className="pad-instrument-badge" aria-hidden="true">
          {instrumentKeyNumber}
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
}

/**
 * Mixer Mode's alternate rendering for a pad tile: a vertical fader instead
 * of a tap target — nothing plays from touching it. Dragging (or just
 * tapping a spot) sets pad.mixLevel from the vertical position within the
 * tile: top is 100 (unity), bottom is 0 (silent). Live-updates a currently-
 * looping pad's actual gain too, the same "dial changes are audible
 * immediately" behavior every other pad dial already has.
 */
function MixerPadFader({ pad, index, engine }: MixerPadFaderProps) {
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
      <span className="mixer-fader-level">{pad.mixLevel}%</span>
    </button>
  )
}
