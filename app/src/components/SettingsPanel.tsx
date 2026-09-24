import { useRef, useState } from 'react'
import { clearAutosave } from '../state/autosave'
import { deserializeProject, isSerializedProject, serializeProject } from '../engine/projectFile'
import type { SerializedProject } from '../engine/projectFile'
import { useBankBuilder } from '../hooks/useBankBuilder'
import type { PadLabelSettings, PadLayout } from '../music/theory'
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

const LAYOUTS: Array<{ id: PadLayout; label: string; hint: string }> = [
  { id: 'guided', label: 'Guided', hint: 'Only notes and chords in the key' },
  { id: 'free', label: 'Free', hint: 'Every note, every chord' },
]

const LABEL_PARTS: Array<{ id: keyof PadLabelSettings; label: string; example: string }> = [
  { id: 'name', label: 'Name', example: 'Am' },
  { id: 'feel', label: 'Feel', example: 'Sad' },
  { id: 'numeral', label: 'Numeral', example: 'vi' },
]

/**
 * How melodic pads are laid out and labeled — two independent toggles, so
 * anyone can pick what reads best to them (a beginner might want feel
 * words on a guided grid; a player might want names on a free one) — plus
 * the rarely-touched project controls: save/load a project file and Clear All.
 */
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
  const { busy: layoutBusy, setPadLayout } = useBankBuilder()

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

  const toggleLabelPart = (part: keyof PadLabelSettings) =>
    dispatch({ type: 'SET_PAD_LABELS', labels: { ...state.padLabels, [part]: !state.padLabels[part] } })

  return (
    <div className="settings">
      <div className="settings-row">
        <div className="settings-row-text">
          <span className="label">Pad layout</span>
          <span className="settings-hint">
            {layoutBusy ? 'Relaying pads…' : LAYOUTS.find((layout) => layout.id === state.padLayout)!.hint}
          </span>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Pad layout">
          {LAYOUTS.map((layout) => (
            <button
              key={layout.id}
              type="button"
              role="radio"
              aria-checked={state.padLayout === layout.id}
              className={state.padLayout === layout.id ? 'segment on' : 'segment'}
              disabled={layoutBusy !== null}
              onClick={() => state.padLayout !== layout.id && void setPadLayout(layout.id)}
              title={layout.hint}
            >
              {layout.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row-text">
          <span className="label">Pad labels</span>
          <span className="settings-hint">What melodic pads show — mix and match.</span>
        </div>
        <div className="chip-row" role="group" aria-label="Pad labels">
          {LABEL_PARTS.map((part) => (
            <button
              key={part.id}
              type="button"
              className={state.padLabels[part.id] ? 'chip-btn on' : 'chip-btn'}
              aria-pressed={state.padLabels[part.id]}
              onClick={() => toggleLabelPart(part.id)}
              title={`e.g. “${part.example}”`}
            >
              {part.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row-text">
          <span className="label">Project file</span>
          <span className="settings-hint">Back up your project or move it to another device.</span>
        </div>
        <div className="settings-actions">
          <button type="button" className="btn" onClick={handleSaveProject}>
            <SaveIcon size={16} />
            Save project
          </button>
          <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
            <OpenIcon size={16} />
            Open project
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
