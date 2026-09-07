import { useRef } from 'react'
import { usePadLooping } from '../hooks/usePadLooping'
import { usePadPlaying } from '../hooks/usePadPlaying'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { contrastingTextColor } from '../utils/color'
import { instrumentIcon } from '../utils/instrumentIcon'
import type { AudioEngine } from '../engine/AudioEngine'
import type { Instrument, Pad } from '../state/types'

/**
 * How long a press has to be held before it's treated as "gating" the sound
 * (release stops it early) rather than a quick tap (plays through in full).
 * See PadButton's pointer handlers for the full behavior.
 */
const GATE_HOLD_THRESHOLD_MS = 200

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

  // Which instrument (by icon) each key sample belongs to, if any — built once
  // per render rather than searching every instrument per pad. Shown whenever a
  // pad holds one of these keys, regardless of whether instrument mode is on.
  const sampleIcons = new Map<string, string>()
  for (const instrumentId of state.instrumentOrder) {
    const instrument = state.instruments[instrumentId] as Instrument | undefined
    if (!instrument) continue
    const icon = instrumentIcon(instrument)
    for (const sampleId of instrument.keySampleIds) sampleIcons.set(sampleId, icon)
  }

  return (
    <section className="panel pad-grid" aria-label="pads">
      <h2>Pads ({state.visiblePadCount})</h2>
      <div
        className={[
          'pad-grid-cells',
          loopModeEnabled ? 'loop-mode' : '',
          instrumentModeEnabled ? 'instrument-mode' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {visiblePads.map((pad, index) => (
          <PadButton
            key={pad.id}
            pad={pad}
            index={index}
            engine={engine}
            selected={pad.id === selectedPadId}
            loopModeEnabled={loopModeEnabled}
            instrumentIcon={pad.sampleId ? sampleIcons.get(pad.sampleId) : undefined}
            onSelect={onSelectPad}
          />
        ))}
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
  /** Set when this pad's sample is a key of some instrument — shown as a small badge. */
  instrumentIcon: string | undefined
  onSelect: (padId: string) => void
}

/**
 * A pad is one undivided tap target. Its behavior depends on the global loop
 * mode toggle (see LoopModeButton): off (the default) — pressing plays the
 * sample, following your finger like a gate once you hold past a short
 * threshold (release cuts it off early), but a quick tap always plays
 * through in full, same as before this existed. On — pressing toggles this
 * pad's loop instead, and gating doesn't apply (there's nothing to gate,
 * it's a discrete on/off). Either way, loop and mute stay off the pad face
 * itself — see the selected-pad action bar in PadsPage — this is purely a
 * playback trigger, not a settings surface.
 */
function PadButton({
  pad,
  index,
  engine,
  selected,
  loopModeEnabled,
  instrumentIcon,
  onSelect,
}: PadButtonProps) {
  const { state } = useAppState()
  const looping = usePadLooping(engine, pad.id)
  const playing = usePadPlaying(engine, pad.id)
  const filled = pad.sampleId !== null

  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const gatedRef = useRef(false)
  const gateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Set on press only while a performance is being captured (see RecordFAB /
  // AudioEngine.startPerformanceCapture) — null the rest of the time, so
  // finishPress() knows whether there's anything to log on release.
  const downAtMsRef = useRef(0)
  const captureOffsetRef = useRef<number | null>(null)

  const clearGateTimer = () => {
    if (gateTimerRef.current !== null) {
      clearTimeout(gateTimerRef.current)
      gateTimerRef.current = null
    }
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
    const source = engine.triggerPad(pad, sample.buffer)
    activeSourceRef.current = source
    gatedRef.current = false
    clearGateTimer()
    gateTimerRef.current = setTimeout(() => {
      gatedRef.current = true
    }, GATE_HOLD_THRESHOLD_MS)

    downAtMsRef.current = performance.now()
    captureOffsetRef.current = engine.isCapturingPerformance()
      ? engine.performanceElapsedSeconds()
      : null
  }

  // Logs this press as a performance hit, if a capture is in progress —
  // shared by pointerup and pointercancel, since a dropped gesture is still
  // an audible hit worth keeping in the recording.
  const finishCapture = () => {
    if (captureOffsetRef.current === null || !pad.sampleId) return
    const sample = state.samples[pad.sampleId]
    if (sample) {
      const durationSeconds = gatedRef.current
        ? (performance.now() - downAtMsRef.current) / 1000
        : null
      engine.logPerformanceHit(pad, sample.buffer, captureOffsetRef.current, durationSeconds)
    }
    captureOffsetRef.current = null
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

    clearGateTimer()
    if (gatedRef.current && activeSourceRef.current) {
      try {
        activeSourceRef.current.stop()
      } catch {
        // Already ended naturally between the hold crossing the gate
        // threshold and this release — nothing left to stop.
      }
    }
    activeSourceRef.current = null
    finishCapture()
    gatedRef.current = false
  }

  const handlePointerCancel = () => {
    // A dropped gesture (OS interruption, scroll takeover) behaves like a
    // release for gating purposes, but never toggles a loop — an incomplete
    // gesture shouldn't commit to a discrete on/off action.
    clearGateTimer()
    if (gatedRef.current && activeSourceRef.current) {
      try {
        activeSourceRef.current.stop()
      } catch {
        // Already ended — nothing to stop.
      }
    }
    activeSourceRef.current = null
    finishCapture()
    gatedRef.current = false
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
        background: filled ? pad.color : 'transparent',
        color: filled ? contrastingTextColor(pad.color) : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <span className="pad-index">{index + 1}</span>
      {instrumentIcon && (
        <span className="pad-instrument-badge" aria-hidden="true">
          {instrumentIcon}
        </span>
      )}
      {!filled && <span className="pad-empty-hint">empty</span>}
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
