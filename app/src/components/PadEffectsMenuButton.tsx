import { useState } from 'react'
import { EFFECT_IDS, EFFECT_PRESETS, NEUTRAL_EFFECT_VALUE, type EffectPreset } from '../state/constants'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { Overlay } from './Overlay'

type PendingConfirm = { kind: 'preset'; preset: EffectPreset } | { kind: 'reset' }

/**
 * Grid-wide sibling to the per-pad effect dials on PadEditPage: rather than
 * opening every pad one at a time, this applies a preset, a bypass, or a
 * reset across every currently visible pad at once. Lives next to
 * LoopModeSwitch in the Pads header — a peer "whole grid" control, not a
 * per-pad settings surface. Live-updates any pad that's currently looping
 * the same way a single dial edit does (see PadEditPage/PadsPage), by
 * calling the same AudioEngine methods once per affected pad.
 */
export function PadEffectsMenuButton() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)

  const visiblePads = state.pads.slice(0, state.visiblePadCount)
  const anyBypassed = visiblePads.some((pad) => pad.effectsBypassed)
  const anyCustomized = visiblePads.some((pad) =>
    pad.effects.some((effect) => effect.value !== NEUTRAL_EFFECT_VALUE),
  )

  const closeAll = () => {
    setMenuOpen(false)
    setPendingConfirm(null)
  }

  const applyPreset = (preset: EffectPreset) => {
    dispatch({
      type: 'APPLY_EFFECT_PRESET_TO_ALL_PADS',
      filter: preset.filter,
      grit: preset.grit,
      echo: preset.echo,
      reverb: preset.reverb,
    })
    for (const pad of visiblePads) {
      if (!engine.isPadLooping(pad.id)) continue
      for (const effectId of ['filter', 'grit', 'echo', 'reverb'] as const) {
        engine.updateLoopingPadEffect(pad.id, effectId, preset[effectId])
      }
    }
    closeAll()
  }

  const handlePickPreset = (preset: EffectPreset) => {
    if (anyCustomized) {
      setPendingConfirm({ kind: 'preset', preset })
    } else {
      applyPreset(preset)
    }
  }

  const toggleBypassAll = () => {
    const bypassed = !anyBypassed
    dispatch({ type: 'SET_ALL_PADS_EFFECTS_BYPASSED', bypassed })
    for (const pad of visiblePads) {
      if (engine.isPadLooping(pad.id)) engine.updateLoopingPadEffectsBypass(pad.id, { ...pad, effectsBypassed: bypassed })
    }
  }

  const performReset = () => {
    dispatch({ type: 'RESET_ALL_PADS_EFFECTS' })
    for (const pad of visiblePads) {
      if (!engine.isPadLooping(pad.id)) continue
      for (const effectId of EFFECT_IDS) {
        engine.updateLoopingPadEffect(pad.id, effectId, NEUTRAL_EFFECT_VALUE)
      }
    }
    closeAll()
  }

  const handleResetAll = () => {
    if (anyCustomized) {
      setPendingConfirm({ kind: 'reset' })
    } else {
      performReset()
    }
  }

  return (
    <>
      <button
        type="button"
        className={anyBypassed || anyCustomized ? 'fx-menu-btn on' : 'fx-menu-btn'}
        onClick={() => setMenuOpen(true)}
        aria-label="Pad effects"
        title="Effects for the whole pad grid"
      >
        <FxIcon />
      </button>

      {menuOpen && (
        <Overlay onClose={closeAll}>
          <h2>Pad effects</h2>
          <p className="muted">
            Applies to all {visiblePads.length} visible pads at once. Per-pad dials still open from
            each pad's own edit screen.
          </p>

          <div className="effect-presets">
            {EFFECT_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="btn btn-secondary preset-btn"
                onClick={() => handlePickPreset(preset)}
              >
                {preset.name}
              </button>
            ))}
          </div>

          <ul className="mode-menu-list">
            <li>
              <button type="button" className="btn btn-secondary mode-menu-btn" onClick={toggleBypassAll}>
                <span className="mode-menu-title">
                  {anyBypassed ? 'Restore all pads’ effects' : 'Bypass all pads’ effects'}
                </span>
                <span className="muted">
                  {anyBypassed
                    ? 'Turns every pad’s effects back on'
                    : 'Plays every pad as if its dials were neutral, without losing them'}
                </span>
              </button>
            </li>
            <li>
              <button type="button" className="btn btn-secondary mode-menu-btn" onClick={handleResetAll}>
                <span className="mode-menu-title">Reset all dials</span>
                <span className="muted">Sets every visible pad's effect dials back to neutral</span>
              </button>
            </li>
          </ul>

          {pendingConfirm && (
            <div className="confirm-overwrite">
              <span>
                {pendingConfirm.kind === 'preset'
                  ? `Apply ${pendingConfirm.preset.name} to all ${visiblePads.length} pads? This overwrites each pad's Filter/Grit/Echo/Reverb dials.`
                  : `Reset all ${visiblePads.length} pads' effect dials to neutral?`}
              </span>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() =>
                  pendingConfirm.kind === 'preset' ? applyPreset(pendingConfirm.preset) : performReset()
                }
              >
                Apply
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setPendingConfirm(null)}>
                Cancel
              </button>
            </div>
          )}

          <button type="button" className="btn btn-secondary overlay-close" onClick={closeAll}>
            Cancel
          </button>
        </Overlay>
      )}
    </>
  )
}

function FxIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="7" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M7 3v2M7 11v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="17" cy="16" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M17 11v2M17 19v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 16h6M15 8h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
