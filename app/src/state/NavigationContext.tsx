import { createContext, useContext, useState, type ReactNode } from 'react'

export type Page = 'pads' | 'sequencer' | 'library'

interface NavigationValue {
  page: Page
  /** Non-null whenever the pad edit popup is open — independent of `page`, since it's an overlay, not a destination. */
  editingPadId: string | null
  goToPads: () => void
  goToSequencer: () => void
  goToLibrary: () => void
  goToEditPad: (padId: string) => void
  goBackFromEdit: () => void
}

const NavigationContext = createContext<NavigationValue | null>(null)

/**
 * Client-side page state only — no router library. This app has three small,
 * flat destinations and no need for URLs/history, so a plain context keeps
 * navigation reachable from deep components (e.g. a pad's "Edit" action)
 * without prop-drilling, at a fraction of a router's weight. Editing a pad is
 * a popup (see PadEditOverlay), not a fourth destination — editingPadId opens
 * and closes it without changing `page` underneath.
 */
export function NavigationProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page>('pads')
  const [editingPadId, setEditingPadId] = useState<string | null>(null)

  const value: NavigationValue = {
    page,
    editingPadId,
    goToPads: () => setPage('pads'),
    goToSequencer: () => setPage('sequencer'),
    goToLibrary: () => setPage('library'),
    goToEditPad: (padId: string) => setEditingPadId(padId),
    goBackFromEdit: () => setEditingPadId(null),
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
