import { useAppState } from '../state/AppStateContext'
import { HitIcon, LoopIcon, MixIcon } from './icons'

type PadMode = 'play' | 'loop' | 'mix'

const MODES: Array<{ id: PadMode; label: string; hint: string; Icon: typeof HitIcon }> = [
  { id: 'play', label: 'Play', hint: 'Tap a pad to play it', Icon: HitIcon },
  { id: 'loop', label: 'Loop', hint: 'Tap a pad to start or stop its loop', Icon: LoopIcon },
  { id: 'mix', label: 'Mix', hint: 'Pads become volume faders', Icon: MixIcon },
]

/**
 * What tapping a pad means, as one labeled switch. Loop and Mix are mutually
 * exclusive (the reducer enforces it); Play turns both off, and tapping Mix
 * while it's on turns it back off. What the pads *are* — drums, bass notes,
 * chords — is the bank's job (see BankTabs), not a mode.
 */
export function PadModeSwitch() {
  const { state, dispatch } = useAppState()
  const { padLoopModeEnabled, padMixerModeEnabled } = state.transport
  const current: PadMode = padMixerModeEnabled ? 'mix' : padLoopModeEnabled ? 'loop' : 'play'

  const select = (mode: PadMode) => {
    switch (mode) {
      case 'play':
        dispatch({ type: 'SET_PAD_MIXER_MODE_ENABLED', enabled: false })
        dispatch({ type: 'SET_PAD_LOOP_MODE_ENABLED', enabled: false })
        break
      case 'loop':
        dispatch({ type: 'SET_PAD_LOOP_MODE_ENABLED', enabled: true })
        break
      case 'mix':
        dispatch({ type: 'SET_PAD_MIXER_MODE_ENABLED', enabled: !padMixerModeEnabled })
        break
    }
  }

  return (
    <div className="segmented mode-switch" role="radiogroup" aria-label="Pad mode">
      {MODES.map(({ id, label, hint, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={current === id}
          className={current === id ? 'segment on' : 'segment'}
          onClick={() => select(id)}
          title={hint}
        >
          <Icon size={16} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
