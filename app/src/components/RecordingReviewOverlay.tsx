import { RecordingReview, type PendingRecording } from './RecordingReview'

interface RecordingReviewOverlayProps {
  recording: PendingRecording
  onDone: () => void
}

/** Modal wrapper so the review step works regardless of which page recording started from. */
export function RecordingReviewOverlay({ recording, onDone }: RecordingReviewOverlayProps) {
  return (
    <div className="overlay-backdrop" onClick={onDone}>
      <div className="overlay-sheet" onClick={(event) => event.stopPropagation()}>
        <RecordingReview recording={recording} onDone={onDone} />
      </div>
    </div>
  )
}
