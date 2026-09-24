import { useState } from 'react'
import { buildBank, DEFAULT_BANK_SOUNDS } from '../engine/bankBuilder'
import { DRUM_KIT_VOICES } from '../engine/drumSynth'
import {
  loopPresetBankKind,
  loopPresetStepsByPadIndex,
  LOOP_PRESETS,
  type LoopCategory,
  type LoopPreset,
} from '../engine/loopPresets'
import { useAppState } from '../state/AppStateContext'
import { BANK_NAMES, getBank, visibleBankPads } from '../state/banks'
import { STEP_COUNT } from '../state/constants'
import { ConfirmDialog } from './ConfirmDialog'
import { SparkIcon } from './icons'
import { Overlay } from './Overlay'

const CATEGORIES: LoopCategory[] = ['Drums', 'Bass', 'Melody']
const PREVIEW_STEP_COUNT = 16

interface PreviewRow {
  order: number
  steps: boolean[]
}

/** One row per distinct drum voice or pitch the preset uses — drums in kit order, notes highest on top, like the real grid. */
function previewRows(preset: LoopPreset): PreviewRow[] {
  const rows = new Map<number, boolean[]>()
  for (const { hit, stepIndex } of preset.steps) {
    const order = hit.kind === 'drum' ? DRUM_KIT_VOICES.indexOf(hit.voice) : -hit.semitones
    const steps = rows.get(order) ?? new Array<boolean>(PREVIEW_STEP_COUNT).fill(false)
    steps[stepIndex] = true
    rows.set(order, steps)
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([order, steps]) => ({ order, steps }))
}

/**
 * Top-right menu on the Sequencer panel offering bundled one-bar loops as a
 * layer to start from. Each loop belongs to a bank (Drums, Bass or Melody)
 * and writes only that bank's rows of the active pattern, so loops stack:
 * a drum groove, then a bassline on top. The loop plays through the bank's
 * own sound — a bank without a suitable one gets a default first — and its
 * notes are read relative to the project key, so they always fit the mood.
 */
export function LoopPresetMenuButton() {
  const { state, dispatch } = useAppState()
  const [menuOpen, setMenuOpen] = useState(false)
  const [building, setBuilding] = useState<string | null>(null)
  const [pendingPreset, setPendingPreset] = useState<LoopPreset | null>(null)
  const pattern = state.patterns.find((p) => p.id === state.activePatternId)

  const bankHasSteps = (preset: LoopPreset) => {
    const bank = getBank(state, loopPresetBankKind(preset))
    return pattern ? bank.padIds.some((padId) => (pattern.steps[padId] ?? []).some((sampleId) => sampleId !== null)) : false
  }

  const closeAll = () => {
    setMenuOpen(false)
    setPendingPreset(null)
  }

  const apply = async (preset: LoopPreset) => {
    if (!pattern) return
    setBuilding(preset.id)
    try {
      let bank = getBank(state, loopPresetBankKind(preset))
      let padsMusic = visibleBankPads(state, bank).map((pad) => ({ music: pad.music }))
      const needsSound = bank.kind === 'drums' ? bank.sound?.type !== 'kit' : bank.sound === null
      if (needsSound) {
        const sound = DEFAULT_BANK_SOUNDS[bank.kind]
        const build = await buildBank(bank, sound, { key: state.key, padLayout: state.padLayout, samples: state.samples })
        dispatch({ type: 'APPLY_BANK_BUILDS', builds: [build], remap: 'index' })
        bank = { ...bank, sound }
        padsMusic = build.pads
      }
      dispatch({
        type: 'WRITE_BANK_PATTERN',
        bankId: bank.id,
        patternId: pattern.id,
        stepsByPadIndex: loopPresetStepsByPadIndex(preset, bank, padsMusic, state.key.tonic),
        minStepCount: STEP_COUNT,
      })
      dispatch({ type: 'SET_ACTIVE_BANK', bankId: bank.id })
      closeAll()
    } finally {
      setBuilding(null)
    }
  }

  const handlePick = (preset: LoopPreset) => {
    if (bankHasSteps(preset)) setPendingPreset(preset)
    else void apply(preset)
  }

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setMenuOpen(true)}
        aria-label="Loop presets"
        title="Starter loops — add a drum, bass or melody layer to the pattern"
      >
        <SparkIcon />
      </button>

      {menuOpen && (
        <Overlay onClose={closeAll} title="Loops" subtitle="Each loop fills one bank’s rows, in the project’s key — stack a few, then edit freely.">
          {CATEGORIES.map((category) => (
            <section className="sheet-section" key={category} aria-label={category}>
              <h3 className="label">{category}</h3>
              <div className="loopers-grid">
                {LOOP_PRESETS.filter((preset) => preset.category === category).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="loop-preset-card"
                    onClick={() => handlePick(preset)}
                    disabled={building !== null}
                  >
                    <span className="loop-preset-name">
                      {building === preset.id ? 'Building…' : preset.name}
                    </span>
                    <span className="loop-preset-preview" aria-hidden="true">
                      {previewRows(preset).map(({ order, steps }) => (
                        <span className="loop-preview-row" key={order}>
                          {steps.map((on, i) => (
                            <span key={i} className={on ? 'loop-preview-cell on' : 'loop-preview-cell'} />
                          ))}
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}

          {pendingPreset && (
            <ConfirmDialog
              message={`Add “${pendingPreset.name}”? It replaces the ${BANK_NAMES[loopPresetBankKind(pendingPreset)]} steps already in this pattern.`}
              confirmLabel="Add"
              onConfirm={() => void apply(pendingPreset)}
              onCancel={() => setPendingPreset(null)}
            />
          )}
        </Overlay>
      )}
    </>
  )
}

