import { PadEditPage } from './PadEditPage'

interface PadEditOverlayProps {
  onClose: () => void
}

/** Modal wrapper for the pad editor, same overlay-backdrop/overlay-sheet pattern as recording review and settings. */
export function PadEditOverlay({ onClose }: PadEditOverlayProps) {
  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="overlay-sheet" onClick={(event) => event.stopPropagation()}>
        <PadEditPage />
      </div>
    </div>
  )
}
