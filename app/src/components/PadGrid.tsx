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

function PadButton({ pad, index, engine, selected, onSelect }: PadButtonProps) {
  const { state, dispatch } = useAppState()
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

  const handleToggleLoop = (event: React.MouseEvent) => {
    event.stopPropagation()
    dispatch({ type: 'SET_PAD_LOOP', padId: pad.id, loop: !pad.loop })
  }

  const handleToggleMute = (event: React.MouseEvent) => {
    event.stopPropagation()
    dispatch({ type: 'SET_PAD_MUTED', padId: pad.id, muted: !pad.muted })
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
      <span
        className={pad.muted ? 'mute-toggle on' : 'mute-toggle'}
        role="switch"
        aria-checked={pad.muted}
        aria-label={pad.muted ? 'Unmute this pad' : 'Mute this pad'}
        onClick={handleToggleMute}
      >
        {pad.muted ? <MutedGlyph /> : <UnmutedGlyph />}
      </span>
      <span
        className={pad.loop ? 'loop-toggle on' : 'loop-toggle'}
        role="switch"
        aria-checked={pad.loop}
        aria-label={pad.loop ? 'Stop this pad looping on tap' : 'Make this pad loop on tap'}
        onClick={handleToggleLoop}
      >
        <LoopGlyph />
      </span>
    </button>
  )
}

function LoopGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d="M4 12a8 8 0 0 1 13.66-5.66L20 8M20 8V3M20 8h-5M20 12a8 8 0 0 1-13.66 5.66L4 16M4 16v5M4 16h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function UnmutedGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path
        d="M17 9a4.5 4.5 0 0 1 0 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MutedGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path
        d="M16 9l5 6M21 9l-5 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
