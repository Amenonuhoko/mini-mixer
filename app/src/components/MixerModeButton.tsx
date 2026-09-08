import { useAppState } from '../state/AppStateContext'

/**
 * Dedicated icon button for Mixer Mode, in the Pads panel header alongside
 * InstrumentModeButton, LoopModeSwitch, and PadEffectsMenuButton. Used to
 * live behind a menu on the floating grid-mode FAB (see the removed
 * GridModeButton) — once Loop Mode and Instrument Mode each got pulled out
 * into their own header controls, that FAB was left guarding a single menu
 * item, which is more UI than a plain on/off toggle needs. A bare toggle is
 * enough here (unlike Instrument Mode): turning Mixer Mode on has nothing to
 * ask first, it just changes what tapping a pad does.
 */
export function MixerModeButton() {
  const { state, dispatch } = useAppState()
  const enabled = state.transport.padMixerModeEnabled

  return (
    <button
      type="button"
      className={enabled ? 'mixer-mode-btn on' : 'mixer-mode-btn'}
      onClick={() => dispatch({ type: 'SET_PAD_MIXER_MODE_ENABLED', enabled: !enabled })}
      aria-pressed={enabled}
      aria-label="Mixer Mode"
      title={
        enabled
          ? 'Mixer Mode is on — pads are volume faders'
          : 'Mixer Mode — pads become drag-to-set volume faders'
      }
    >
      <SlidersIcon />
    </button>
  )
}

function SlidersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M5 19V13M5 9V5M12 19V11M12 7V5M19 19V15M19 11V5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="5" cy="11" r="2" fill="currentColor" />
      <circle cx="12" cy="9" r="2" fill="currentColor" />
      <circle cx="19" cy="13" r="2" fill="currentColor" />
    </svg>
  )
}
