import { useEffect, useState } from 'react'
import { usePadLooping } from '../hooks/usePadLooping'
import { padLabel } from '../music/theory'
import { useAppState } from '../state/AppStateContext'
import { getActiveBank, visibleBankPads } from '../state/banks'
import { useEngine } from '../state/EngineContext'
import { useNavigation } from '../state/NavigationContext'
import { EditIcon, FxIcon, MuteIcon, SwapIcon } from './icons'
import { PadGrid } from './PadGrid'
import { PadLibraryPicker } from './PadLibraryPicker'

/**
 * Home page: the pad module. Tapping a pad selects it (and plays it), and its
 * actions appear in a strip directly under the grid — inside the same module,
 * right where your hand already is — rather than in a separate panel below
 * the fold: Mute, a one-tap effects bypass (reversible; the dials are kept),
 * Edit (dials + trim), and — on the Drums bank — Swap (pull another sound
 * from the library onto this pad without leaving the grid). Melodic pads
 * change sound as a whole bank instead (the bank strip's sound button).
 */
export function PadsPage() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { goToEditPad, selectedPadId, selectPad: setSelectedPadId } = useNavigation()
  const [pickingLibrary, setPickingLibrary] = useState(false)
  const bank = getActiveBank(state)
  const visiblePads = visibleBankPads(state, bank)
  const looping = usePadLooping(engine, selectedPadId ?? '')

  // Keep a pad selected at all times, falling back to the first visible pad
  // if none is selected yet or the selected one was hidden by shrinking count.
  useEffect(() => {
    const stillVisible = visiblePads.some((pad) => pad.id === selectedPadId)
    if (!stillVisible) {
      setSelectedPadId(visiblePads[0]?.id ?? null)
    }
    // Only re-check when the set of visible pads changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePads.map((pad) => pad.id).join(',')])

  const selectedIndex = visiblePads.findIndex((pad) => pad.id === selectedPadId)
  const selectedPad = selectedIndex >= 0 ? visiblePads[selectedIndex] : undefined
  const selectedSample = selectedPad?.sampleId ? state.samples[selectedPad.sampleId] : undefined
  const selectedLabel = selectedPad?.music ? padLabel(selectedPad.music, state.key, state.padLabels) : null

  const handleToggleMute = () => {
    if (!selectedPad) return
    dispatch({ type: 'SET_PAD_MUTED', padId: selectedPad.id, muted: !selectedPad.muted })
  }

  const handleToggleEffects = () => {
    if (!selectedPad) return
    const bypassed = !selectedPad.effectsBypassed
    dispatch({ type: 'SET_PAD_EFFECTS_BYPASSED', padId: selectedPad.id, bypassed })
    if (looping) engine.updateLoopingPadEffectsBypass(selectedPad.id, { ...selectedPad, effectsBypassed: bypassed })
  }

  const contextStrip = selectedPad && (
    <div className="pad-context">
      <div className="pad-context-id">
        <span className="pad-context-num readout">{selectedLabel?.name ?? String(selectedIndex + 1).padStart(2, '0')}</span>
        <span className="pad-context-name">
          {selectedLabel ? [selectedLabel.primary, selectedLabel.secondary].filter((part) => part && part !== selectedLabel.name).join(' · ') || selectedSample?.label : selectedSample?.label ?? 'Empty pad'}
        </span>
        {looping && <span className="chip chip-live">Loop</span>}
      </div>
      <div className="pad-context-actions">
        <button
          type="button"
          className={selectedPad.muted ? 'action on-warn' : 'action'}
          onClick={handleToggleMute}
          aria-pressed={selectedPad.muted}
        >
          <MuteIcon muted={selectedPad.muted} size={16} />
          <span>{selectedPad.muted ? 'Muted' : 'Mute'}</span>
        </button>
        <button
          type="button"
          className={selectedPad.effectsBypassed ? 'action on-warn' : 'action'}
          onClick={handleToggleEffects}
          aria-pressed={selectedPad.effectsBypassed}
          title={selectedPad.effectsBypassed ? 'Effects bypassed — tap to turn back on' : 'Bypass this pad’s effects'}
        >
          <FxIcon size={16} />
          <span>{selectedPad.effectsBypassed ? 'FX off' : 'FX'}</span>
        </button>
        <button type="button" className="action" onClick={() => goToEditPad(selectedPad.id)}>
          <EditIcon size={16} />
          <span>Edit</span>
        </button>
        {bank.kind === 'drums' && (
          <button type="button" className="action" onClick={() => setPickingLibrary(true)}>
            <SwapIcon size={16} />
            <span>Swap</span>
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="page pads-page">
      <PadGrid selectedPadId={selectedPadId} onSelectPad={setSelectedPadId} footer={contextStrip} />
      {pickingLibrary && selectedPad && (
        <PadLibraryPicker padId={selectedPad.id} onClose={() => setPickingLibrary(false)} />
      )}
    </div>
  )
}
