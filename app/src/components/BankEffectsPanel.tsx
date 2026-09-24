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
import { BANK_NAMES, getActiveBank, visibleBankPads } from '../state/banks'

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
  } catch {
    return []
  }
}

/**
 * Effects for every pad of the active bank at once — the "All" scope of the
 * Mix sheet (see PadEditOverlay): on/off for the whole bank, one-tap presets
 * (with a preview of their Filter/Grit/Echo/Reverb balance, plus any you've
 * saved), the four character dials, save-as-preset and reset.
 */
export function BankEffectsPanel() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const [customPresets, setCustomPresets] = useState<EffectPreset[]>(readCustomPresets)
  const bank = getActiveBank(state)
  const visiblePads = visibleBankPads(state, bank)
  const allPresets = [...EFFECT_PRESETS, ...customPresets]
  const anyBypassed = visiblePads.some((pad) => pad.effectsBypassed)

  useEffect(() => {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customPresets))
  }, [customPresets])

  const applyPreset = (preset: EffectPreset) => {
    dispatch({ type: 'APPLY_EFFECT_PRESET_TO_ALL_PADS', filter: preset.filter, grit: preset.grit, echo: preset.echo, reverb: preset.reverb })
    for (const pad of visiblePads) {
      if (!engine.isPadLooping(pad.id)) continue
      for (const effectId of CHARACTER_EFFECT_IDS) engine.updateLoopingPadEffect(pad.id, effectId, preset[effectId])
    }
  }

  const saveCurrentPreset = () => {
    const source = visiblePads[0]
    if (!source) return
    const name = window.prompt('Name this effects preset')?.trim()
    if (!name) return
    const value = (id: (typeof CHARACTER_EFFECT_IDS)[number]) => source.effects.find((effect) => effect.id === id)?.value ?? 0
    setCustomPresets((current) => [
      ...current.filter((preset) => preset.name !== name),
      { name, filter: value('filter'), grit: value('grit'), echo: value('echo'), reverb: value('reverb') },
    ])
  }

  // The bank's first showing pad stands in for "the bank's current value" —
  // every write path here sets the whole bank identically, so any pad would do.
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
      if (engine.isPadLooping(pad.id)) engine.updateLoopingPadEffectsBypass(pad.id, { ...pad, effectsBypassed: bypassed })
    }
  }

  const resetAll = () => {
    dispatch({ type: 'RESET_ALL_PADS_EFFECTS' })
    for (const pad of visiblePads) {
      if (!engine.isPadLooping(pad.id)) continue
      for (const effectId of EFFECT_IDS) engine.updateLoopingPadEffect(pad.id, effectId, NEUTRAL_EFFECT_VALUE)
    }
  }

  return (
    <section className="edit-section bank-fx" aria-label={`${BANK_NAMES[bank.kind]} effects`}>
      <header className="edit-section-head">
        <h3 className="label">
          {BANK_NAMES[bank.kind]} effects <span className="muted">· all {visiblePads.length} pads</span>
        </h3>
        <EffectsSwitch bypassed={anyBypassed} onToggle={toggleBypassAll} />
      </header>
      <div className="fx-quick-presets">
        {allPresets.map((preset) => (
          <button key={preset.name} type="button" className="fx-preset-button" onClick={() => applyPreset(preset)}>
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
                className="slider bipolar"
                style={{ '--fill': `${(value - EFFECT_MIN) / (EFFECT_MAX - EFFECT_MIN)}` } as React.CSSProperties}
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
        <button type="button" className="btn btn-sm" onClick={saveCurrentPreset} disabled={visiblePads.length === 0}>
          Save preset
        </button>
        <button type="button" className="btn btn-sm" onClick={resetAll}>
          Reset
        </button>
      </div>
    </section>
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
