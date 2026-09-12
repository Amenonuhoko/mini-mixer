interface EffectsSwitchProps {
  bypassed: boolean
  onToggle: () => void
}

/**
 * Shared "Effects on/off" control — the switch itself doubles as the label,
 * so it reads unambiguously as current state ("Effects on"/"Effects off")
 * rather than sitting next to a separate static "Effects" heading with a
 * same-looking-either-way button beside it. Reuses the same track+thumb
 * switch look as LoopModeSwitch for one consistent on/off visual language
 * across the app, rather than a plain button whose only tell is its text.
 */
export function EffectsSwitch({ bypassed, onToggle }: EffectsSwitchProps) {
  const on = !bypassed
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={on ? 'loop-switch effects-switch on' : 'loop-switch effects-switch'}
      onClick={onToggle}
      title={on ? 'Effects on — tap to bypass' : 'Effects off (bypassed) — tap to turn back on'}
    >
      <span className="effects-switch-label">{on ? 'Effects on' : 'Effects off'}</span>
      <span className="loop-switch-track">
        <span className="loop-switch-thumb" />
      </span>
    </button>
  )
}
