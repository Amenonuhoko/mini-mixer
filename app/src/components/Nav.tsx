import { useRef } from 'react'
import { deserializeProject, isSerializedProject, serializeProject } from '../engine/projectFile'
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
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const loadInputRef = useRef<HTMLInputElement>(null)

  const handleStopAll = () => {
    engine.stopAllSounds()
    dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: false })
  }

  const handleSaveProject = () => {
    const project = serializeProject(state, Date.now())
    const stamp = new Date(project.savedAt).toISOString().slice(0, 16).replace(':', '-')
    const url = URL.createObjectURL(new Blob([JSON.stringify(project)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `mini-mixer-${stamp}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleLoadProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isSerializedProject(parsed) || !window.confirm(`Load "${file.name}"? This replaces the current project.`)) {
        return
      }
      engine.stopAllSounds()
      dispatch({ type: 'LOAD_PROJECT', state: await deserializeProject(parsed, engine) })
    } catch {
      window.alert("Couldn't load that project file.")
    }
  }

  return (
    <nav className="top-nav">
      <div className="top-nav-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={page === 'pads'}
          className={page === 'pads' ? 'nav-tab active' : 'nav-tab'}
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
          className="nav-project-btn"
          onClick={handleSaveProject}
          title="Save a portable project backup"
        >
          Save
        </button>
        <button
          type="button"
          className="nav-project-btn"
          onClick={() => loadInputRef.current?.click()}
          title="Load a project backup"
        >
          Load
        </button>
        <input
          ref={loadInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => void handleLoadProject(event)}
        />
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
