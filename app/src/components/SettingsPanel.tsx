import { useRef, useState } from 'react'
import { clearAutosave } from '../state/autosave'
import { deserializeProject, isSerializedProject, serializeProject } from '../engine/projectFile'
import type { SerializedProject } from '../engine/projectFile'
import { MAX_PAD_COUNT, MIN_PAD_COUNT } from '../state/constants'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** Less-frequently-touched controls — pad count, save/load, and Clear All — kept out of the sticky PlayBar. */
export function SettingsPanel() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const [confirmClear, setConfirmClear] = useState(false)
  const [pendingLoad, setPendingLoad] = useState<{
    fileName: string
    project: SerializedProject
  } | null>(null)
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleClearAll = () => {
    engine.stopAllSounds()
    dispatch({ type: 'CLEAR_ALL' })
    setConfirmClear(false)
    void clearAutosave()
  }

  const setPadCount = (count: number) => dispatch({ type: 'SET_VISIBLE_PAD_COUNT', count })

  const handleSaveProject = () => {
    const project = serializeProject(state, Date.now())
    const stamp = new Date(project.savedAt).toISOString().slice(0, 16).replace(':', '-')
    downloadJson(`beat-maker-${stamp}.json`, project)
  }

  const handleFileChosen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = '' // allow picking the same file again later
    if (!file) return
    setLoadStatus('idle')
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isSerializedProject(parsed)) {
        setLoadStatus('error')
        return
      }
      setPendingLoad({ fileName: file.name, project: parsed })
    } catch {
      setLoadStatus('error')
    }
  }

  const handleConfirmLoad = async () => {
    if (!pendingLoad) return
    setLoadStatus('loading')
    try {
      engine.stopAllSounds()
      const loaded = await deserializeProject(pendingLoad.project, engine)
      dispatch({ type: 'LOAD_PROJECT', state: loaded })
      setPendingLoad(null)
      setLoadStatus('idle')
    } catch {
      setLoadStatus('error')
    }
  }

  return (
    <section className="panel settings" aria-label="settings">
      <h2>Settings</h2>
      <p className="muted">
        Your session autosaves to this browser. Save a project file to back it up or move it to
        another device.
      </p>

      <div className="settings-row">
        <span className="settings-label">Pad count</span>
        <div className="stepper">
          <button
            type="button"
            className="stepper-btn"
            onClick={() => setPadCount(state.visiblePadCount - 1)}
            disabled={state.visiblePadCount <= MIN_PAD_COUNT}
            aria-label="Fewer pads"
          >
            −
          </button>
          <span className="stepper-value">{state.visiblePadCount}</span>
          <button
            type="button"
            className="stepper-btn"
            onClick={() => setPadCount(state.visiblePadCount + 1)}
            disabled={state.visiblePadCount >= MAX_PAD_COUNT}
            aria-label="More pads"
          >
            +
          </button>
        </div>
      </div>

      <div className="settings-divider" />

      <div className="settings-row">
        <span className="settings-label">Project file</span>
        <div className="settings-file-actions">
          <button type="button" className="btn btn-secondary" onClick={handleSaveProject}>
            Save
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            Load
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => void handleFileChosen(event)}
          />
        </div>
      </div>

      {loadStatus === 'error' && (
        <p className="muted settings-error">
          Couldn't read that file — it may not be a Beat Maker project file.
        </p>
      )}

      {pendingLoad && (
        <div className="confirm-overwrite">
          <span>
            Load "{pendingLoad.fileName}"? This replaces your current pads, library, and pattern.
          </span>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => void handleConfirmLoad()}
            disabled={loadStatus === 'loading'}
          >
            {loadStatus === 'loading' ? 'Loading…' : 'Yes, load it'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPendingLoad(null)}
            disabled={loadStatus === 'loading'}
          >
            Cancel
          </button>
        </div>
      )}

      <div className="settings-divider" />

      {confirmClear ? (
        <div className="confirm-overwrite">
          <span>Clear everything — recordings, pads, pattern?</span>
          <button type="button" className="btn btn-danger" onClick={handleClearAll}>
            Yes, clear all
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setConfirmClear(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setConfirmClear(true)}>
          Clear All
        </button>
      )}
    </section>
  )
}
