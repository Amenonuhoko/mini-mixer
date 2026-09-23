import { useState } from 'react'
import { useAppState } from '../state/AppStateContext'
import { HitIcon, KeysIcon, LoopIcon, MixIcon } from './icons'
import { InstrumentPicker } from './InstrumentPicker'

type PadMode = 'play' | 'loop' | 'keys' | 'mix'

const MODES: Array<{ id: PadMode; label: string; hint: string; Icon: typeof HitIcon }> = [
  { id: 'play', label: 'Play', hint: 'Tap a pad to play it', Icon: HitIcon },
  { id: 'loop', label: 'Loop', hint: 'Tap a pad to start or stop its loop', Icon: LoopIcon },
  { id: 'keys', label: 'Keys', hint: 'Lay an instrument across the pads', Icon: KeysIcon },
  { id: 'mix', label: 'Mix', hint: 'Pads become volume faders', Icon: MixIcon },
]

/**
 * What tapping a pad means, as one labeled switch instead of four unrelated
 * icon buttons. Maps onto the reducer's existing mode flags without changing
 * their rules: Loop and Keys are mutually exclusive; Mix is an overlay that
 * keeps Keys selected underneath, so leaving Mix returns to the same
 * instrument layout.
 *
 * - Play turns everything off (a quick Keys instrument is cleaned up and the
 *   pads it covered are restored — see Shell's auto-instrument effect).
 * - Keys always asks which instrument first; tapping it again while active
 *   re-opens the picker to swap. From Mix, it simply returns to the keys
 *   already underneath.
 * - Tapping Mix while it's on turns it back off.
 */
export function PadModeSwitch() {
  const { state, dispatch } = useAppState()
  const { padLoopModeEnabled, padInstrumentModeEnabled, padMixerModeEnabled } = state.transport
  const [picking, setPicking] = useState(false)

  const current: PadMode = padMixerModeEnabled
    ? 'mix'
    : padLoopModeEnabled
      ? 'loop'
      : padInstrumentModeEnabled
        ? 'keys'
        : 'play'

  const select = (mode: PadMode) => {
    switch (mode) {
      case 'play':
        dispatch({ type: 'SET_PAD_MIXER_MODE_ENABLED', enabled: false })
        dispatch({ type: 'SET_PAD_LOOP_MODE_ENABLED', enabled: false })
        dispatch({ type: 'SET_PAD_INSTRUMENT_MODE_ENABLED', enabled: false })
        break
      case 'loop':
        dispatch({ type: 'SET_PAD_LOOP_MODE_ENABLED', enabled: true })
        break
      case 'keys':
        if (padMixerModeEnabled && padInstrumentModeEnabled) {
          dispatch({ type: 'SET_PAD_MIXER_MODE_ENABLED', enabled: false })
        } else {
          setPicking(true)
        }
        break
      case 'mix':
        dispatch({ type: 'SET_PAD_MIXER_MODE_ENABLED', enabled: !padMixerModeEnabled })
        break
    }
  }

  return (
    <>
      <div className="segmented mode-switch" role="radiogroup" aria-label="Pad mode">
        {MODES.map(({ id, label, hint, Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={current === id}
            className={current === id ? 'segment on' : 'segment'}
            onClick={() => select(id)}
            title={id === 'keys' && current === 'keys' ? 'Swap the instrument' : hint}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      {picking && <InstrumentPicker onClose={() => setPicking(false)} />}
    </>
  )
}
