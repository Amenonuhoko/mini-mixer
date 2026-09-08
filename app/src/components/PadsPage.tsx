import { useEffect, useState } from 'react'
import { usePadLooping } from '../hooks/usePadLooping'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { useNavigation } from '../state/NavigationContext'
import { PadGrid } from './PadGrid'
import { PadLibraryPicker } from './PadLibraryPicker'

/**
 * Home page: pads are the hero content, full width, nothing else competing
 * for space. Selecting a pad (tap, which also plays it) surfaces a summary
 * bar below the grid with four generously-sized actions — Mute, Effects,
 * Edit, and Library (see .selected-pad-actions, a plain 2x2 grid). Loop used
 * to live here too, but it's now driven by the global loop-mode toggle (see
 * LoopModeSwitch) — tapping a pad directly toggles its loop while that mode
 * is on, so a separate button for it here would be redundant. Effects is a
 * reversible bypass, not the Edit popup's "Reset dials": it plays the pad as
 * if every dial were neutral without touching the stored values, so turning
 * it back off restores exactly what was dialed in. Library opens a popup to
 * pull an existing sample onto this pad without leaving the page — the
 * reverse direction of the Library page's own "Assign…" action. The pad
 * itself stays a single undivided tap target either way; every other
 * per-pad action lives down here, where there's room to make it easy to hit
 * reliably.
 */
export function PadsPage() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { goToEditPad } = useNavigation()
  const [selectedPadId, setSelectedPadId] = useState<string | null>(null)
  const [pickingLibrary, setPickingLibrary] = useState(false)
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

  const handleToggleMute = () => {
    if (!selectedPad) return
    dispatch({ type: 'SET_PAD_MUTED', padId: selectedPad.id, muted: !selectedPad.muted })
  }

  return (
    <div className="page pads-page">
      <PadGrid selectedPadId={selectedPadId} onSelectPad={setSelectedPadId} />
      {selectedPad && (
        <div className="panel selected-pad-bar">
          <div className="selected-pad-tags">
            <span className="tag" style={{ background: selectedPad.color }}>
              Pad {selectedIndex + 1}
            </span>
            {looping && <span className="tag tag-live">looping</span>}
            {selectedPad.muted && <span className="tag tag-muted">muted</span>}
            {selectedPad.effectsBypassed && <span className="tag tag-fx-off">fx off</span>}
          </div>
          <div className="selected-pad-actions">
            <button
              type="button"
              className={selectedPad.muted ? 'action-btn action-mute on' : 'action-btn action-mute'}
              onClick={handleToggleMute}
              aria-pressed={selectedPad.muted}
            >
              {selectedPad.muted ? <MutedGlyph /> : <UnmutedGlyph />}
              Mute
            </button>
            <button
              type="button"
              className="action-btn action-effects"
              onClick={() => goToEditPad(selectedPad.id)}
            >
              <EffectsOnGlyph />
              Effects
            </button>
            <button
              type="button"
              className="action-btn action-library"
              onClick={() => setPickingLibrary(true)}
            >
              <LibraryGlyph />
              Library
            </button>
          </div>
        </div>
      )}
      {pickingLibrary && selectedPad && (
        <PadLibraryPicker padId={selectedPad.id} onClose={() => setPickingLibrary(false)} />
      )}
    </div>
  )
}

function LibraryGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M5 4v16M9 4l9 3v13l-9-3M9 4v13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function UnmutedGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path
        d="M17 9a4.5 4.5 0 0 1 0 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MutedGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path
        d="M16 9l5 6M21 9l-5 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function EffectsOnGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M5 19V13M5 9V5M12 19V11M12 7V5M19 19V15M19 11V5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="5" cy="11" r="2" fill="currentColor" />
      <circle cx="12" cy="9" r="2" fill="currentColor" />
      <circle cx="19" cy="13" r="2" fill="currentColor" />
    </svg>
  )
}

