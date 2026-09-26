import { createContext, useContext, useState, type ReactNode } from 'react'

export type Page = 'pads' | 'sequencer' | 'song' | 'library'

interface NavigationValue {
  page: Page
  /** Non-null whenever the pad edit popup is open — independent of `page`, since it's an overlay, not a destination. */
  editingPadId: string | null
  goToPads: () => void
  goToSequencer: () => void
  goToSong: () => void
  goToLibrary: () => void
  goToEditPad: (padId: string) => void
  goBackFromEdit: () => void
  /**
   * The pad you're working with, shared by the Pads grid and the Sequencer —
   * pick a pad on one and the other shows the same one, so going back and
   * forth never loses your place.
   */
  selectedPadId: string | null
  selectPad: (padId: string | null) => void
  /** Make a beat, at the top of Seq, can be folded down to its title; this remembers it across pages and patterns. */
  beatStarterOpen: boolean
  setBeatStarterOpen: (open: boolean | ((open: boolean) => boolean)) => void
  /** Bumped when Make a beat writes a whole new beat, so the sequencer can fold to the rows it uses. */
  beatStarts: number
  markBeatStarted: () => void
}

const NavigationContext = createContext<NavigationValue | null>(null)

/**
 * Client-side page state only — no router library. This app has four small,
 * flat destinations and no need for URLs/history, so a plain context keeps
 * navigation reachable from deep components (e.g. a pad's "Edit" action)
 * without prop-drilling, at a fraction of a router's weight. Editing a pad is
 * a popup (see PadEditOverlay), not a fourth destination — editingPadId opens
 * and closes it without changing `page` underneath.
 */
export function NavigationProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page>('pads')
  const [editingPadId, setEditingPadId] = useState<string | null>(null)
  const [selectedPadId, setSelectedPadId] = useState<string | null>(null)
  const [beatStarterOpen, setBeatStarterOpen] = useState(true)
  const [beatStarts, setBeatStarts] = useState(0)

  const value: NavigationValue = {
    page,
    editingPadId,
    goToPads: () => setPage('pads'),
    goToSequencer: () => setPage('sequencer'),
    goToSong: () => setPage('song'),
    goToLibrary: () => setPage('library'),
    goToEditPad: (padId: string) => setEditingPadId(padId),
    goBackFromEdit: () => setEditingPadId(null),
    selectedPadId,
    selectPad: setSelectedPadId,
    beatStarterOpen,
    setBeatStarterOpen,
    beatStarts,
    markBeatStarted: () => setBeatStarts((count) => count + 1),
  }

  return <NavigationContext value={value}>{children}</NavigationContext>
}

export function useNavigation(): NavigationValue {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error('useNavigation must be used within a NavigationProvider')
  }
  return context
}
