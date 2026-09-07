import { Overlay } from './Overlay'
import { RecordingReview, type PendingRecording } from './RecordingReview'

interface RecordingReviewOverlayProps {
  recording: PendingRecording
  onDone: () => void
}

/** Modal wrapper so the review step works regardless of which page recording started from. */
export function RecordingReviewOverlay({ recording, onDone }: RecordingReviewOverlayProps) {
  return (
    <Overlay onClose={onDone}>
      <RecordingReview recording={recording} onDone={onDone} />
    </Overlay>
  )
}
