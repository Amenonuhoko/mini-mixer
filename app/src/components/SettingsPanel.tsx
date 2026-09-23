import { useRef, useState } from 'react'
import { clearAutosave } from '../state/autosave'
import { deserializeProject, isSerializedProject, serializeProject } from '../engine/projectFile'
import type { SerializedProject } from '../engine/projectFile'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { ConfirmDialog } from './ConfirmDialog'
import { OpenIcon, SaveIcon, TrashIcon } from './icons'

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** Rarely-touched project controls — save/load a project file and Clear All. The one place those live (pad count lives on the pad module itself). */
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
    <div className="settings">
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="label">Project file</span>
          <span className="settings-hint">Back up your project or move it to another device.</span>
        </div>
        <div className="settings-actions">
          <button type="button" className="btn" onClick={handleSaveProject}>
            <SaveIcon size={16} />
            Save
          </button>
          <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
            <OpenIcon size={16} />
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
        <p className="settings-error">Couldn't read that file — it may not be a Beat Maker project file.</p>
      )}

      {pendingLoad && (
        <ConfirmDialog
          message={`Load "${pendingLoad.fileName}"? This replaces your current pads, library, and pattern.`}
          confirmLabel={loadStatus === 'loading' ? 'Loading…' : 'Yes, load it'}
          confirmDisabled={loadStatus === 'loading'}
          cancelDisabled={loadStatus === 'loading'}
          onConfirm={() => void handleConfirmLoad()}
          onCancel={() => setPendingLoad(null)}
        />
      )}

      <div className="settings-row">
        <div className="settings-row-text">
          <span className="label">Start over</span>
          <span className="settings-hint">Clears recordings, pads and patterns.</span>
        </div>
        <button type="button" className="btn btn-danger" onClick={() => setConfirmClear(true)}>
          <TrashIcon size={16} />
          Clear all
        </button>
      </div>
      {confirmClear && (
        <ConfirmDialog
          message="Clear everything — recordings, pads, pattern?"
          confirmLabel="Yes, clear all"
          onConfirm={handleClearAll}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  )
}
