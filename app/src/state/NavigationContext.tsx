import { createContext, useContext, useState, type ReactNode } from 'react'

export type Page = 'pads' | 'sequencer' | 'library' | 'edit-pad'

interface NavigationValue {
  page: Page
  /** Only meaningful when page === 'edit-pad'. */
  editingPadId: string | null
  goToPads: () => void
  goToSequencer: () => void
  goToLibrary: () => void
  goToEditPad: (padId: string) => void
  goBackFromEdit: () => void
}

const NavigationContext = createContext<NavigationValue | null>(null)

/**
 * Client-side page state only — no router library. This app has four small,
 * flat destinations and no need for URLs/history, so a plain context keeps
 * navigation reachable from deep components (e.g. a pad's "Edit" action)
 * without prop-drilling, at a fraction of a router's weight.
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
    goToEditPad: (padId: string) => {
      setEditingPadId(padId)
      setPage('edit-pad')
    },
    goBackFromEdit: () => setPage('pads'),
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
