import { useSyncExternalStore } from 'react'

/** Matches the breakpoint the responsive layout switches at — see .app-shell / .wide-split in index.css. */
const WIDE_QUERY = '(min-width: 900px)'

function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(WIDE_QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getSnapshot(): boolean {
  return window.matchMedia(WIDE_QUERY).matches
}

/**
 * True above the desktop breakpoint — drives showing Pads and Sequencer side
 * by side instead of as separate pages (see App.tsx's CurrentPage). Backed by
 * matchMedia + useSyncExternalStore rather than a resize listener, so it only
 * re-renders when the boolean actually flips, not on every resize tick.
 */
export function useIsWideScreen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
