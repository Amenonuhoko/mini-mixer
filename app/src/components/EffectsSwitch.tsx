interface EffectsSwitchProps {
  bypassed: boolean
  onToggle: () => void
}

/**
 * Shared "Effects on/off" control — the switch itself doubles as the label,
 * so it reads unambiguously as current state ("On"/"Bypassed") rather than
 * sitting next to a separate static heading with a same-looking-either-way
 * button beside it.
 */
export function EffectsSwitch({ bypassed, onToggle }: EffectsSwitchProps) {
  const on = !bypassed
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Effects"
      className={on ? 'switch on' : 'switch'}
      onClick={onToggle}
      title={on ? 'Effects on — tap to bypass' : 'Effects bypassed — tap to turn back on'}
    >
      <span className="switch-label">{on ? 'On' : 'Bypassed'}</span>
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
    </button>
  )
}
