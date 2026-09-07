import { SettingsPanel } from './SettingsPanel'

interface SettingsOverlayProps {
  onClose: () => void
}

export function SettingsOverlay({ onClose }: SettingsOverlayProps) {
  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="overlay-sheet" onClick={(event) => event.stopPropagation()}>
        <SettingsPanel />
        <button type="button" className="btn btn-secondary overlay-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
