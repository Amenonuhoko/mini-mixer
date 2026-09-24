import { useEffect } from 'react'
import { useAppState } from '../state/AppStateContext'
import { getActiveBank, visibleBankPads } from '../state/banks'
import { useNavigation } from '../state/NavigationContext'
import { PadGrid } from './PadGrid'

/**
 * Home page: the pad module. Tapping a pad selects it (and plays it) — the
 * same selection the Sequencer shows. A pad's level, sound, trim and effects
 * are all in Mix (see PadGrid and PadEditOverlay).
 */
export function PadsPage() {
  const { state } = useAppState()
  const { selectedPadId, selectPad } = useNavigation()
  const bank = getActiveBank(state)
  const visiblePads = visibleBankPads(state, bank)

  // Keep a pad selected at all times, falling back to the first visible pad
  // if none is selected yet or the selected one was hidden by shrinking count.
  useEffect(() => {
    const stillVisible = visiblePads.some((pad) => pad.id === selectedPadId)
    if (!stillVisible) {
      selectPad(visiblePads[0]?.id ?? null)
    }
    // Only re-check when the set of visible pads changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePads.map((pad) => pad.id).join(',')])

  return (
    <div className="page pads-page">
      <PadGrid selectedPadId={selectedPadId} onSelectPad={selectPad} />
    </div>
  )
}
