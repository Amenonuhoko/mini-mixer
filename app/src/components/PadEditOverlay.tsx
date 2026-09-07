import { Overlay } from './Overlay'
import { PadEditPage } from './PadEditPage'

interface PadEditOverlayProps {
  onClose: () => void
}

/** Modal wrapper for the pad editor, same shared Overlay as every other popup. */
export function PadEditOverlay({ onClose }: PadEditOverlayProps) {
  return (
    <Overlay onClose={onClose}>
      <PadEditPage />
    </Overlay>
  )
}
