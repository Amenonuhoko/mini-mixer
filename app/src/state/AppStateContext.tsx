import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import { createStartingState, reducer, type Action } from './reducer'
import type { AppState } from './types'

interface AppStateContextValue {
  state: AppState
  dispatch: Dispatch<Action>
}

const AppStateContext = createContext<AppStateContextValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => createStartingState())

  return <AppStateContext value={{ state, dispatch }}>{children}</AppStateContext>
}

export function useAppState(): AppStateContextValue {
  const context = useContext(AppStateContext)
  if (!context) {
    throw new Error('useAppState must be used within an AppStateProvider')
  }
  return context
}
