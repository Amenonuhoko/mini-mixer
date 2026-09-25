import { usePadLooping } from '../hooks/usePadLooping'
import { useAppState } from '../state/AppStateContext'
import { bankOfPad, visibleBankPads } from '../state/banks'
import { useEngine } from '../state/EngineContext'
import { useNavigation } from '../state/NavigationContext'
import type { AudioEngine } from '../engine/AudioEngine'
import type { Pad } from '../state/types'
import { padIdentity } from '../utils/padIdentity'
import { Overlay } from './Overlay'
import { PadEditPage } from './PadEditPage'

interface PadEditOverlayProps {
  onClose: () => void
}

/**
 * A pad's own sheet — its level, sound, trim and effects — opened by tapping
 * a pad in Mix. The strip across the top switches between the bank's pads.
 * (The bank's volume and effects for all its pads are in Mix itself.)
 */
export function PadEditOverlay({ onClose }: PadEditOverlayProps) {
  const { state } = useAppState()
  const engine = useEngine()
  const { editingPadId, goToEditPad } = useNavigation()
  const pad = state.pads.find((p) => p.id === editingPadId)
  const bank = pad ? bankOfPad(state, pad.id) : undefined
  const identity = pad && bank ? padIdentity(state, bank, pad) : null
  const pads = bank ? visibleBankPads(state, bank) : pad ? [pad] : []

  return (
    <Overlay
      onClose={onClose}
      className="sheet-tall"
      title={`Pad ${identity?.number ?? ''}`}
      subtitle={identity ? `${identity.icon ? `${identity.icon} ` : ''}${identity.name}` : ''}
    >
      <div className="pad-switcher-strip" role="tablist" aria-label="Switch pad">
        {pads.map((item, index) => (
          <PadSwitcherSwatch
            key={item.id}
            pad={item}
            index={index}
            engine={engine}
            current={item.id === editingPadId}
            onSwitch={goToEditPad}
          />
        ))}
      </div>
      <PadEditPage />
    </Overlay>
  )
}

interface PadSwitcherSwatchProps {
  pad: Pad
  index: number
  engine: AudioEngine
  current: boolean
  onSwitch: (padId: string) => void
}

/** A "jump to this pad" swatch, with a passive looping dot. */
function PadSwitcherSwatch({ pad, index, engine, current, onSwitch }: PadSwitcherSwatchProps) {
  const looping = usePadLooping(engine, pad.id)
  const filled = pad.sampleId !== null

  return (
    <button
      type="button"
      role="tab"
      aria-selected={current}
      className={['pad-switcher-swatch', current ? 'current' : '', filled ? '' : 'empty'].filter(Boolean).join(' ')}
      data-glow-pad={pad.id}
      onClick={() => onSwitch(pad.id)}
    >
      {String(index + 1).padStart(2, '0')}
      {looping && <span className="pad-switcher-loop-dot" aria-hidden="true" />}
    </button>
  )
}
