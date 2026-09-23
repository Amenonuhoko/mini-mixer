import { useAppState } from '../state/AppStateContext'
import { useNavigation } from '../state/NavigationContext'
import { Overlay } from './Overlay'
import { PadEditPage } from './PadEditPage'

interface PadEditOverlayProps {
  onClose: () => void
}

/** Modal wrapper for the pad editor, same shared Overlay (and header) as every other sheet. */
export function PadEditOverlay({ onClose }: PadEditOverlayProps) {
  const { state } = useAppState()
  const { editingPadId } = useNavigation()
  const pad = state.pads.find((p) => p.id === editingPadId)
  const padNumber = pad ? state.pads.indexOf(pad) + 1 : 0
  const sample = pad?.sampleId ? state.samples[pad.sampleId] : undefined

  return (
    <Overlay
      onClose={onClose}
      className="sheet-tall"
      title={`Pad ${String(padNumber).padStart(2, '0')}`}
      subtitle={sample ? sample.label : 'Empty — load a sound to edit it'}
    >
      <PadEditPage />
    </Overlay>
  )
}
