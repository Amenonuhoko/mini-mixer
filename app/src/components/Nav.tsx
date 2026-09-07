import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { useNavigation } from '../state/NavigationContext'

interface NavProps {
  onOpenSettings: () => void
}

/**
 * Persistent top bar: page navigation plus two utility actions that need to
 * be reachable regardless of page — a panic "stop everything" and settings.
 * Kept separate from the bottom PlayBar on purpose: PlayBar shapes *how*
 * playback sounds (tempo, loop mode, metronome), Nav is for getting around
 * and emergency control, not playback shaping.
 */
export function Nav({ onOpenSettings }: NavProps) {
  const { page, goToPads, goToSequencer, goToLibrary } = useNavigation()
  const { dispatch } = useAppState()
  const engine = useEngine()

  const handleStopAll = () => {
    engine.stopAllSounds()
    dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: false })
  }

  return (
    <nav className="top-nav">
      <div className="top-nav-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={page === 'pads' || page === 'edit-pad'}
          className={page === 'pads' || page === 'edit-pad' ? 'nav-tab active' : 'nav-tab'}
          onClick={goToPads}
        >
          Pads
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={page === 'sequencer'}
          className={page === 'sequencer' ? 'nav-tab active' : 'nav-tab'}
          onClick={goToSequencer}
        >
          Sequencer
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={page === 'library'}
          className={page === 'library' ? 'nav-tab active' : 'nav-tab'}
          onClick={goToLibrary}
        >
          Library
        </button>
      </div>
      <div className="top-nav-actions">
        <button
          type="button"
          className="nav-icon-btn nav-stop-all"
          onClick={handleStopAll}
          aria-label="Stop all sounds"
          title="Stop all sounds — loops, sequencer, everything"
        >
          <StopIcon />
        </button>
        <button
          type="button"
          className="nav-icon-btn"
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
        >
          <GearIcon />
        </button>
      </div>
    </nav>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2.5v2.6M12 18.9v2.6M4.9 4.9l1.85 1.85M17.25 17.25l1.85 1.85M2.5 12h2.6M18.9 12h2.6M4.9 19.1l1.85-1.85M17.25 6.75l1.85-1.85"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
