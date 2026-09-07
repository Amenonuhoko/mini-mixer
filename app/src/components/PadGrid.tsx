import { usePadLooping } from '../hooks/usePadLooping'
import { usePadPlaying } from '../hooks/usePadPlaying'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { contrastingTextColor } from '../utils/color'
import type { AudioEngine } from '../engine/AudioEngine'
import type { Pad } from '../state/types'

interface PadGridProps {
  selectedPadId: string | null
  onSelectPad: (padId: string) => void
}

export function PadGrid({ selectedPadId, onSelectPad }: PadGridProps) {
  const { state } = useAppState()
  const engine = useEngine()
  const visiblePads = state.pads.slice(0, state.visiblePadCount)

  return (
    <section className="panel pad-grid" aria-label="pads">
      <h2>Pads ({state.visiblePadCount})</h2>
      <div className="pad-grid-cells">
        {visiblePads.map((pad, index) => (
          <PadButton
            key={pad.id}
            pad={pad}
            index={index}
            engine={engine}
            selected={pad.id === selectedPadId}
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
  onSelect: (padId: string) => void
}

/**
 * A pad is one undivided tap target — always plays a one-shot, nothing else.
 * Loop and mute used to live as small icon buttons nested inside the pad
 * itself; moved out to the selected-pad action bar (see PadsPage) because a
 * ~28px control crowded into the corner of an already-small tile is exactly
 * the kind of touch target that's hard to hit reliably, especially loop,
 * which gets tapped rhythmically during actual play. Playing/looping state
 * stays visible directly on the pad (glow, pulse, equalizer bars) since
 * those are purely informational and need no touch precision at all.
 */
function PadButton({ pad, index, engine, selected, onSelect }: PadButtonProps) {
  const { state } = useAppState()
  const looping = usePadLooping(engine, pad.id)
  const playing = usePadPlaying(engine, pad.id)
  const filled = pad.sampleId !== null

  const handleTrigger = () => {
    onSelect(pad.id)
    if (!pad.sampleId || pad.muted) return
    const sample = state.samples[pad.sampleId]
    if (!sample) return
    engine.triggerPad(pad, sample.buffer)
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
      onClick={handleTrigger}
    >
      <span className="pad-index">{index + 1}</span>
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
