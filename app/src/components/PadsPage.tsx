import { useEffect, useState } from 'react'
import { usePadLooping } from '../hooks/usePadLooping'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { useNavigation } from '../state/NavigationContext'
import { PadGrid } from './PadGrid'

/**
 * Home page: pads are the hero content, full width, nothing else competing
 * for space. Selecting a pad (tap) surfaces a small summary bar below the
 * grid with an explicit "Edit Sound" action — casual play/loop/mute stay on
 * the pad itself, deliberate editing is one tap away but never in the way.
 */
export function PadsPage() {
  const { state } = useAppState()
  const engine = useEngine()
  const { goToEditPad } = useNavigation()
  const [selectedPadId, setSelectedPadId] = useState<string | null>(null)
  const visiblePads = state.pads.slice(0, state.visiblePadCount)
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

  return (
    <div className="page pads-page">
      <PadGrid selectedPadId={selectedPadId} onSelectPad={setSelectedPadId} />
      {selectedPad && (
        <div className="panel selected-pad-bar">
          <span className="tag" style={{ background: selectedPad.color }}>
            Pad {selectedIndex + 1}
          </span>
          {looping && <span className="tag tag-live">looping</span>}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => goToEditPad(selectedPad.id)}
          >
            Edit Sound →
          </button>
        </div>
      )}
    </div>
  )
}
