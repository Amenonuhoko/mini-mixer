import { useState } from 'react'
import {
  buildLoopPresetInstrumentKeys,
  loopPresetKeyLabels,
  padIndexForHit,
  LOOP_PRESETS,
  type LoopCategory,
  type LoopPreset,
} from '../engine/loopPresets'
import { useAppState } from '../state/AppStateContext'
import { createId } from '../state/defaults'
import { captureAutoInstrumentPadSnapshot } from '../utils/autoInstrumentSnapshot'
import { buildKeySamples } from '../utils/buildInstrumentSamples'
import type { Instrument } from '../state/types'
import { ConfirmDialog } from './ConfirmDialog'
import { Overlay } from './Overlay'

const CATEGORIES: LoopCategory[] = ['Drums', 'Bass', 'Melody']
const PREVIEW_STEP_COUNT = 16

interface PreviewRow {
  padIndex: number
  steps: boolean[]
}

/** One row per distinct voice/pitch the preset actually uses, low pad-index first — the same relative order those hits land on the real grid in, just without blank rows for pads the preset never touches. */
function previewRows(preset: LoopPreset): PreviewRow[] {
  const rows = new Map<number, boolean[]>()
  for (const step of preset.steps) {
    const padIndex = padIndexForHit(step.hit)
    const steps = rows.get(padIndex) ?? new Array<boolean>(PREVIEW_STEP_COUNT).fill(false)
    steps[step.stepIndex] = true
    rows.set(padIndex, steps)
  }
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([padIndex, steps]) => ({ padIndex, steps }))
}

/**
 * Top-right menu on the Sequencer panel (see .sequencer-header) offering
 * bundled one-bar loop presets (engine/loopPresets.ts) as a shortcut to
 * programming a pattern by hand. Each card's mini preview grid is
 * deliberately drawn in the same rows-of-16-steps shape as the real step
 * grid below it, since picking a preset replaces the real thing: it builds
 * whichever instrument the preset needs (the default drum kit, or a pitched
 * preset for a Bass/Melody phrase — same builders InstrumentModeButton's
 * quick presets use), lays it across the pads, and writes the preset's
 * exact steps into the active pattern (via APPLY_LOOP_PRESET) so there's
 * something real and editable on the grid immediately. Tracked as a
 * temporary/"auto" instrument exactly like InstrumentModeButton's own quick
 * presets — replacing or removing it restores the pads it covered, while
 * the programmed steps themselves keep working afterward, since a sequencer
 * cell remembers the exact sample id that filled it (see Pattern.steps)
 * independent of whether the instrument that built it is still around.
 */
export function LoopPresetMenuButton() {
  const { state, dispatch } = useAppState()
  const [menuOpen, setMenuOpen] = useState(false)
  const [building, setBuilding] = useState<string | null>(null)
  const [pendingPreset, setPendingPreset] = useState<LoopPreset | null>(null)

  const pattern = state.patterns.find((p) => p.id === state.activePatternId)
  const visiblePads = state.pads.slice(0, state.visiblePadCount)
  const patternHasSteps = pattern
    ? visiblePads.some((pad) => (pattern.steps[pad.id] ?? []).some((sampleId) => sampleId !== null))
    : false
  const anyPadFilled = visiblePads.some((pad) => pad.sampleId !== null)

  const closeAll = () => {
    setMenuOpen(false)
    setPendingPreset(null)
  }

  const removeAutoInstrument = () => {
    if (state.transport.autoInstrumentId) {
      dispatch({ type: 'REMOVE_INSTRUMENT', instrumentId: state.transport.autoInstrumentId })
    }
  }

  const apply = async (preset: LoopPreset) => {
    if (!pattern) return
    setBuilding(preset.id)
    try {
      const buffers = await buildLoopPresetInstrumentKeys(preset)
      const keySamples = buildKeySamples(buffers, loopPresetKeyLabels(preset))
      const padSnapshot = captureAutoInstrumentPadSnapshot(state, keySamples.length)
      const instrument: Instrument = {
        id: createId('instrument'),
        name: preset.name,
        source: 'preset',
        keySampleIds: keySamples.map((s) => s.id),
      }
      const stepsByPadIndex: Record<number, number[]> = {}
      for (const step of preset.steps) {
        const padIndex = padIndexForHit(step.hit)
        const steps = stepsByPadIndex[padIndex] ?? []
        steps.push(step.stepIndex)
        stepsByPadIndex[padIndex] = steps
      }
      removeAutoInstrument()
      dispatch({
        type: 'APPLY_LOOP_PRESET',
        instrument,
        keySamples,
        patternId: pattern.id,
        stepsByPadIndex,
      })
      dispatch({ type: 'SET_PAD_INSTRUMENT_MODE_ENABLED', enabled: true })
      dispatch({ type: 'SET_AUTO_INSTRUMENT_ID', instrumentId: instrument.id, padSnapshot })
      closeAll()
    } finally {
      setBuilding(null)
    }
  }

  const handlePick = (preset: LoopPreset) => {
    if (patternHasSteps || anyPadFilled) setPendingPreset(preset)
    else void apply(preset)
  }

  return (
    <>
      <button
        type="button"
        className="loop-preset-menu-btn"
        onClick={() => setMenuOpen(true)}
        aria-label="Loop presets"
        title="Bundled loops — pick one to build its instrument and program it onto the grid"
      >
        <LoopIcon />
      </button>

      {menuOpen && (
        <Overlay onClose={closeAll}>
          <h2>Loop presets</h2>
          <p className="muted">
            Builds the instrument it needs and writes its pattern onto the grid — edit freely after.
          </p>
          {CATEGORIES.map((category) => (
            <div className="loopers-category" key={category}>
              <h3 className="loopers-category-title">{category}</h3>
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
                      {previewRows(preset).map(({ padIndex, steps }) => (
                        <span className="loop-preview-row" key={padIndex}>
                          {steps.map((on, i) => (
                            <span key={i} className={on ? 'loop-preview-cell on' : 'loop-preview-cell'} />
                          ))}
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {pendingPreset && (
            <ConfirmDialog
              message={`Add “${pendingPreset.name}”? This replaces the current pattern and every pad's sound.`}
              confirmLabel="Add"
              onConfirm={() => void apply(pendingPreset)}
              onCancel={() => setPendingPreset(null)}
            />
          )}

          <button type="button" className="btn btn-secondary overlay-close" onClick={closeAll}>
            Cancel
          </button>
        </Overlay>
      )}
    </>
  )
}

function LoopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M4 12a8 8 0 0 1 8-8h5M17 4l-3-3M17 4l-3 3M20 12a8 8 0 0 1-8 8H7M7 20l3 3M7 20l3-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
