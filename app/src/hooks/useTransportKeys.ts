import { useEffect, useRef } from 'react'
import { useAppState } from '../state/AppStateContext'
import { useNavigation } from '../state/NavigationContext'
import { keysOwnedElsewhere } from '../utils/keyboard'
import { useTogglePlayback } from './useTogglePlayback'

/**
 * The desktop transport keys, listened for on the window: Space plays and
 * stops (as in every DAW — so a button that happens to have focus doesn't
 * also fire; Enter still activates it), and ← → step through the banks
 * while the pads or sequencer are on screen. Nothing fires while typing,
 * adjusting a select or slider, or with a sheet open, and browser shortcuts
 * (any Ctrl / Cmd / Alt chord) pass straight through. The pads' own keys
 * live with the pad grid (see PadGrid), which knows their layout.
 */
export function useTransportKeys(): void {
  const togglePlayback = useTogglePlayback()
  const { state, dispatch } = useAppState()
  const { page } = useNavigation()
  const latest = useRef({ togglePlayback, state, dispatch, page })
  useEffect(() => {
    latest.current = { togglePlayback, state, dispatch, page }
  })

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      if (keysOwnedElsewhere(event.target)) return
      const { togglePlayback, state, dispatch, page } = latest.current
      if (event.code === 'Space') {
        event.preventDefault()
        togglePlayback()
        return
      }
      if ((event.code === 'ArrowLeft' || event.code === 'ArrowRight') && (page === 'pads' || page === 'sequencer')) {
        const { banks, activeBankId } = state
        const current = banks.findIndex((bank) => bank.id === activeBankId)
        if (current < 0) return
        const next = banks[(current + (event.code === 'ArrowRight' ? 1 : banks.length - 1)) % banks.length]!
        event.preventDefault()
        dispatch({ type: 'SET_ACTIVE_BANK', bankId: next.id })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
