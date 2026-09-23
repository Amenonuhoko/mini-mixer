import { Overlay } from './Overlay'
import { SettingsPanel } from './SettingsPanel'

interface SettingsOverlayProps {
  onClose: () => void
}

export function SettingsOverlay({ onClose }: SettingsOverlayProps) {
  return (
    <Overlay onClose={onClose} title="Settings" subtitle="Your session autosaves in this browser.">
      <SettingsPanel />
    </Overlay>
  )
}
