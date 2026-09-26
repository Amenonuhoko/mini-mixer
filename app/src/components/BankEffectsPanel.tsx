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
 * saved), Pitch in semitones for the pattern in the grid (presets leave it
 * alone), the four character dials, save-as-preset and reset.
 */
export function BankEffectsPanel() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const [customPresets, setCustomPresets] = useState<EffectPreset[]>(readCustomPresets)
  const bank = getActiveBank(state)
  const visiblePads = visibleBankPads(state, bank)
  const allPresets = [...EFFECT_PRESETS, ...customPresets]
  const anyBypassed = visiblePads.some((pad) => pad.effectsBypassed)
  // The presets fold away behind one row that names the one in use.
  const [presetsOpen, setPresetsOpen] = useState(false)
  const matches = (preset: EffectPreset) =>
    visiblePads.length > 0 && visiblePads.every((pad) => CHARACTER_EFFECT_IDS.every((id) => (pad.effects.find((effect) => effect.id === id)?.value ?? 0) === preset[id]))
  const currentPreset = allPresets.find(matches)
  const anyCharacter = visiblePads.some((pad) => CHARACTER_EFFECT_IDS.some((id) => (pad.effects.find((effect) => effect.id === id)?.value ?? 0) !== 0))

  useEffect(() => {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customPresets))
  }, [customPresets])

  const applyPreset = (preset: EffectPreset) => {
    dispatch({ type: 'APPLY_EFFECT_PRESET_TO_ALL_PADS', filter: preset.filter, grit: preset.grit, echo: preset.echo, reverb: preset.reverb })
    for (const pad of visiblePads) {
      if (pad.effectsBypassed) continue
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

  // Pitch belongs to the pattern in the grid (the Verse can sit higher than the Chorus), not to the pads.
  const pattern = state.patterns.find((item) => item.id === state.activePatternId)
  const pitch = pattern?.pitch?.[bank.kind] ?? 0
  // Named the way the song knows it: the sections that play this pattern (they share it), else the pattern.
  const pitchScope = [...new Set(state.songSections.filter((section) => section.patternId === pattern?.id).map((section) => section.name).filter(Boolean))].join(', ') || pattern?.name || 'this pattern'
  const setPitch = (semitones: number) => pattern && dispatch({ type: 'SET_PATTERN_PITCH', patternId: pattern.id, bank: bank.kind, semitones })

  const handleDialChange = (effectId: EffectId, value: number) => {
    dispatch({ type: 'SET_ALL_PADS_EFFECT', effectId, value })
    for (const pad of visiblePads) {
      if (!pad.effectsBypassed) engine.updateLoopingPadEffect(pad.id, effectId, value)
    }
  }

  const toggleBypassAll = () => {
    const bypassed = !anyBypassed
    dispatch({ type: 'SET_ALL_PADS_EFFECTS_BYPASSED', bypassed })
    for (const pad of visiblePads) {
      if (!pad.effectsBypassed) engine.updateLoopingPadEffectsBypass(pad.id, { ...pad, effectsBypassed: bypassed })
    }
  }

  const resetAll = () => {
    dispatch({ type: 'RESET_ALL_PADS_EFFECTS' })
    setPitch(0)
    for (const pad of visiblePads) {
      if (pad.effectsBypassed) continue
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
      <button
        type="button"
        className={presetsOpen ? 'fx-presets-toggle open' : 'fx-presets-toggle'}
        aria-expanded={presetsOpen}
        onClick={() => setPresetsOpen((open) => !open)}
      >
        <span className="label">Presets</span>
        <span className="fx-presets-current">{currentPreset?.name ?? (anyCharacter ? 'Custom' : 'None')}</span>
        <span className="fx-presets-chevron" aria-hidden="true">{presetsOpen ? '▴' : '▾'}</span>
      </button>
      {presetsOpen && (
      <div className="fx-quick-presets">
        {allPresets.map((preset) => (
          <button key={preset.name} type="button" className={preset === currentPreset ? 'fx-preset-button on' : 'fx-preset-button'} onClick={() => applyPreset(preset)}>
            <EffectPreview preset={preset} />
            <span>{preset.name}{preset.description && <small className="fx-preset-description">{preset.description}</small>}</span>
          </button>
        ))}
      </div>
      )}
      <div className="fx-custom-dials">
        <div className="dial-row fx-custom-dial-row fx-pitch-row">
          <div className="dial-label-row">
            <label htmlFor="fx-dial-pitch" className="dial-label-text">
              Pitch <span className="muted">· {pitchScope}</span>
            </label>
            <span className="dial-value">{pitch === 0 ? '0' : `${pitch > 0 ? '+' : '−'}${Math.abs(pitch)} st`}</span>
          </div>
          <input
            id="fx-dial-pitch"
            type="range"
            className="slider bipolar"
            style={{ '--fill': `${(pitch + 12) / 24}` } as React.CSSProperties}
            min={-12}
            max={12}
            step={1}
            value={pitch}
            disabled={!pattern}
            onChange={(event) => setPitch(Number(event.target.value))}
            aria-label={`${BANK_NAMES[bank.kind]} pitch in semitones`}
            aria-valuetext={`${pitch} semitones in ${pitchScope}`}
          />
          {bank.kind !== 'drums' && pitch % 12 !== 0 && (
            <small className="fx-pitch-note">Out of the song's key — ±12 st moves a whole octave and stays in key.</small>
          )}
        </div>
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
