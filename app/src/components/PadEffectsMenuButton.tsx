import { useEffect, useState } from 'react'
import {
  EFFECT_IDS,
  EFFECT_MAX,
  EFFECT_MIN,
  EFFECT_PRESETS,
  EFFECT_STEP,
  NEUTRAL_EFFECT_VALUE,
  type EffectPreset,
} from '../state/constants'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import type { EffectId } from '../state/types'
import { EffectsSwitch } from './EffectsSwitch'

const CUSTOM_PRESETS_KEY = 'mini-mixer.custom-effect-presets'
const CHARACTER_EFFECT_IDS = ['filter', 'grit', 'echo', 'reverb'] as const
const CHARACTER_EFFECT_LABELS: Record<(typeof CHARACTER_EFFECT_IDS)[number], string> = {
  filter: 'Filter',
  grit: 'Grit',
  echo: 'Echo',
  reverb: 'Reverb',
}

function formatDialValue(value: number): string {
  if (value === 0) return '0'
  return value > 0 ? `+${value}` : String(value)
}

function readCustomPresets(): EffectPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((preset): preset is EffectPreset =>
          typeof preset === 'object' && preset !== null && typeof (preset as EffectPreset).name === 'string',
        )
      : []
  } catch { return [] }
}

/** Compact, anchored grid-wide effect controls. The preview bars make the
 * Filter/Grit/Echo/Reverb balance readable before choosing a preset. */
export function PadEffectsMenuButton() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const [open, setOpen] = useState(false)
  const [customPresets, setCustomPresets] = useState<EffectPreset[]>(readCustomPresets)
  const visiblePads = state.pads.slice(0, state.visiblePadCount)
  const allPresets = [...EFFECT_PRESETS, ...customPresets]
  const anyBypassed = visiblePads.some((pad) => pad.effectsBypassed)
  const anyCustomized = visiblePads.some((pad) =>
    pad.effects.some((effect) => effect.value !== NEUTRAL_EFFECT_VALUE),
  )

  useEffect(() => {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customPresets))
  }, [customPresets])

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
    setOpen(false)
  }

  const saveCurrentPreset = () => {
    const source = visiblePads[0]
    if (!source) return
    const name = window.prompt('Name this effects preset')?.trim()
    if (!name) return
    const value = (id: 'filter' | 'grit' | 'echo' | 'reverb') =>
      source.effects.find((effect) => effect.id === id)?.value ?? 0
    setCustomPresets((current) => [...current.filter((preset) => preset.name !== name), {
      name, filter: value('filter'), grit: value('grit'), echo: value('echo'), reverb: value('reverb'),
    }])
  }

  // The first visible pad stands in for "the grid's current value" — same
  // representative-pad approach saveCurrentPreset already uses. All visible
  // pads always carry the same character-dial values here (every write path
  // — presets, this live dial, an applied instrument's own remembered combo
  // — sets them identically across the grid), so any pad would do.
  const currentCharacterValue = (effectId: (typeof CHARACTER_EFFECT_IDS)[number]): number =>
    visiblePads[0]?.effects.find((effect) => effect.id === effectId)?.value ?? 0

  const handleDialChange = (effectId: EffectId, value: number) => {
    dispatch({ type: 'SET_ALL_PADS_EFFECT', effectId, value })
    for (const pad of visiblePads) {
      if (engine.isPadLooping(pad.id)) engine.updateLoopingPadEffect(pad.id, effectId, value)
    }
  }

  const toggleBypassAll = () => {
    const bypassed = !anyBypassed
    dispatch({ type: 'SET_ALL_PADS_EFFECTS_BYPASSED', bypassed })
    for (const pad of visiblePads) {
      if (engine.isPadLooping(pad.id)) {
        engine.updateLoopingPadEffectsBypass(pad.id, { ...pad, effectsBypassed: bypassed })
      }
    }
  }

  const resetAll = () => {
    dispatch({ type: 'RESET_ALL_PADS_EFFECTS' })
    for (const pad of visiblePads) {
      if (!engine.isPadLooping(pad.id)) continue
      for (const effectId of EFFECT_IDS) {
        engine.updateLoopingPadEffect(pad.id, effectId, NEUTRAL_EFFECT_VALUE)
      }
    }
    setOpen(false)
  }

  return (
    <div className="fx-popover-anchor">
      <button
        type="button"
        className={anyBypassed || anyCustomized ? 'fx-menu-btn on' : 'fx-menu-btn'}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Pad effects"
        title="Quick effects for all visible pads"
      >
        <FxIcon />
      </button>
      {open && (
        <div className="fx-floating-panel" role="dialog" aria-label="Quick pad effects">
          <div className="fx-floating-heading">
            <div className="fx-floating-heading-text">
              <span>Pad effects</span>
              <span className="muted">{visiblePads.length} pads</span>
            </div>
            <EffectsSwitch bypassed={anyBypassed} onToggle={toggleBypassAll} />
          </div>
          <div className="fx-quick-presets">
            {allPresets.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="fx-preset-button"
                onClick={() => applyPreset(preset)}
              >
                <EffectPreview preset={preset} />
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
          <div className="fx-custom-dials">
            {CHARACTER_EFFECT_IDS.map((effectId) => {
              const value = currentCharacterValue(effectId)
              return (
                <div className="dial-row fx-custom-dial-row" key={effectId}>
                  <div className="dial-label-row">
                    <label htmlFor={`fx-dial-${effectId}`} className="dial-label-text">
                      {CHARACTER_EFFECT_LABELS[effectId]}
                    </label>
                    <span className="dial-value">{formatDialValue(value)}</span>
                  </div>
                  <input
                    id={`fx-dial-${effectId}`}
                    type="range"
                    className="dial-slider"
                    min={EFFECT_MIN}
                    max={EFFECT_MAX}
                    step={EFFECT_STEP}
                    value={value}
                    disabled={visiblePads.length === 0}
                    onChange={(event) => handleDialChange(effectId, Number(event.target.value))}
                  />
                </div>
              )
            })}
          </div>
          <div className="fx-floating-actions">
            <button type="button" className="btn btn-secondary" onClick={saveCurrentPreset} disabled={visiblePads.length === 0}>
              Save preset
            </button>
            <button type="button" className="btn btn-secondary" onClick={resetAll}>
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function EffectPreview({ preset }: { preset: EffectPreset }) {
  const values = [preset.filter, preset.grit, preset.echo, preset.reverb]
  return (
    <span className="effect-preview" aria-hidden="true">
      {values.map((value, index) => (
        <i key={index} style={{ height: `${20 + Math.abs(value) * 0.55}%` }} />
      ))}
    </span>
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
