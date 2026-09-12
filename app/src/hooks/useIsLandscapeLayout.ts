import { useSyncExternalStore } from 'react'

/**
 * A distinctly *wide-and-short* shape — a phone rotated to landscape, or a
 * short/ultra-wide desktop window (21:9 and wider) — rather than just "wide"
 * (see useIsWideScreen's 900px breakpoint, which every ordinary 16:9 desktop
 * window already satisfies). 2:1 sits comfortably above standard 16:9
 * (1.78) and 16:10 (1.6) monitors so an everyday desktop window never flips
 * this on, while still catching most landscape phones (many exceed 2:1,
 * e.g. 19.5:9 = 2.17) and any true ultra-wide monitor.
 */
const LANDSCAPE_QUERY = '(min-aspect-ratio: 2/1)'

function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(LANDSCAPE_QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getSnapshot(): boolean {
  return window.matchMedia(LANDSCAPE_QUERY).matches
}

/**
 * True in landscape phones and ultra-wide/short desktop windows — drives
 * stacking Sequencer above Pads, both full width, instead of the normal
 * single-column phone layout or the side-by-side wide-screen split (see
 * App.tsx's CurrentPage) — the point being to actually use the available
 * horizontal space rather than leaving it to margins either way.
 */
export function useIsLandscapeLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
