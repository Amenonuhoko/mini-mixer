import { useEffect, useRef } from 'react'
import type { AudioEngine } from '../engine/AudioEngine'
import { loadAutosave, saveAutosave } from '../state/autosave'
import type { Action } from '../state/reducer'
import type { AppState } from '../state/types'

/** How long to wait after the last state change before writing an autosave. */
const AUTOSAVE_DEBOUNCE_MS = 1200

/**
 * Restores the last autosaved session on mount, then keeps saving on every
 * change after that (debounced, so a dragged dial doesn't hammer IndexedDB on
 * every tick). Best-effort throughout — a browser without IndexedDB, or one
 * that refuses it in private browsing, just means no persistence, not a crash.
 */
export function useAutosave(
  state: AppState,
  dispatch: React.Dispatch<Action>,
  engine: AudioEngine,
): void {
  const hydratedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    loadAutosave(engine)
      .then((loaded) => {
        if (!cancelled && loaded) dispatch({ type: 'LOAD_PROJECT', state: loaded })
      })
      .catch(() => {
        // No autosave available — starting from a blank session is the correct fallback.
      })
      .finally(() => {
        if (!cancelled) hydratedRef.current = true
      })
    return () => {
      cancelled = true
    }
    // Runs once on mount — engine/dispatch are stable for the app's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Skip saving until the initial load attempt above has resolved, so a
    // blank starting state can never overwrite an existing autosave record
    // before it's had a chance to be restored.
    if (!hydratedRef.current) return
    const timer = setTimeout(() => {
      void saveAutosave(state).catch(() => {
        // Best-effort — a failed write just means this tick isn't persisted.
      })
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [state])
}
