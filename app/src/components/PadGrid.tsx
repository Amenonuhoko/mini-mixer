import { usePadLooping } from '../hooks/usePadLooping'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
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
  const filled = pad.sampleId !== null

  const handleTrigger = () => {
    onSelect(pad.id)
    if (!pad.sampleId) return
    const sample = state.samples[pad.sampleId]
    if (!sample) return
    engine.triggerPad(pad, sample.buffer)
  }

  const handleToggleLoop = (event: React.MouseEvent) => {
    event.stopPropagation()
    dispatch({ type: 'SET_PAD_LOOP', padId: pad.id, loop: !pad.loop })
  }

  return (
    <button
      type="button"
      className={[
        'pad',
        filled ? 'filled' : 'empty',
        selected ? 'selected' : '',
        looping ? 'looping' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ borderColor: pad.color, background: filled ? pad.color : 'transparent' }}
      onClick={handleTrigger}
    >
      <span className="pad-index">{index + 1}</span>
      <span
        className={pad.loop ? 'loop-toggle on' : 'loop-toggle'}
        role="switch"
        aria-checked={pad.loop}
        aria-label="loop this pad"
        onClick={handleToggleLoop}
      >
        ↻
      </span>
    </button>
  )
}
