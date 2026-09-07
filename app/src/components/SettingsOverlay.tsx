import { Overlay } from './Overlay'
import { SettingsPanel } from './SettingsPanel'

interface SettingsOverlayProps {
  onClose: () => void
}

export function SettingsOverlay({ onClose }: SettingsOverlayProps) {
  return (
    <Overlay onClose={onClose}>
      <SettingsPanel />
      <button type="button" className="btn btn-secondary overlay-close" onClick={onClose}>
        Close
      </button>
    </Overlay>
  )
}
