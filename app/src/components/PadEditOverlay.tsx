import { usePadLooping } from '../hooks/usePadLooping'
import { useAppState } from '../state/AppStateContext'
import { BANK_NAMES, bankOfPad, visibleBankPads } from '../state/banks'
import { useEngine } from '../state/EngineContext'
import { useNavigation } from '../state/NavigationContext'
import type { AudioEngine } from '../engine/AudioEngine'
import type { Pad } from '../state/types'
import { padIdentity } from '../utils/padIdentity'
import { BankEffectsPanel } from './BankEffectsPanel'
import { Overlay } from './Overlay'
import { PadEditPage } from './PadEditPage'

interface PadEditOverlayProps {
  onClose: () => void
}

/**
 * The Mix sheet — the one place for a pad's level, sound, trim and effects,
 * opened by tapping a pad in Mix mode. The strip across the top switches
 * between the bank's pads, and its first swatch, ALL, shows the effects for
 * every pad of the bank at once (see BankEffectsPanel).
 */
export function PadEditOverlay({ onClose }: PadEditOverlayProps) {
  const { state } = useAppState()
  const engine = useEngine()
  const { editingPadId, goToEditPad, mixScope, setMixScope } = useNavigation()
  const pad = state.pads.find((p) => p.id === editingPadId)
  const bank = pad ? bankOfPad(state, pad.id) : undefined
  const identity = pad && bank ? padIdentity(state, bank, pad) : null
  const pads = bank ? visibleBankPads(state, bank) : pad ? [pad] : []
  const all = mixScope === 'all'

  return (
    <Overlay
      onClose={onClose}
      className="sheet-tall"
      title={all ? `Mix · ${bank ? BANK_NAMES[bank.kind] : 'Pads'}` : `Mix · Pad ${identity?.number ?? ''}`}
      subtitle={all ? 'Effects for every pad in the bank' : identity ? `${identity.icon ? `${identity.icon} ` : ''}${identity.name}` : ''}
    >
      <div className="pad-switcher-strip" role="tablist" aria-label="Switch pad">
        <button
          type="button"
          role="tab"
          aria-selected={all}
          className={all ? 'pad-switcher-swatch all current' : 'pad-switcher-swatch all'}
          onClick={() => setMixScope('all')}
        >
          All
        </button>
        {pads.map((item, index) => (
          <PadSwitcherSwatch
            key={item.id}
            pad={item}
            index={index}
            engine={engine}
            current={!all && item.id === editingPadId}
            onSwitch={goToEditPad}
          />
        ))}
      </div>
      {all ? <BankEffectsPanel /> : <PadEditPage />}
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
