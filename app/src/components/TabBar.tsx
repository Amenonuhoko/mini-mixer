import { useNavigation } from '../state/NavigationContext'
import { LibraryIcon, PadsIcon, SeqIcon } from './icons'
import { RecordButton, RecordSourceToggle } from './RecordButton'
import type { PendingRecording } from './RecordingReview'

interface TabBarProps {
  /** True when Pads and Sequencer are shown together (wide or landscape layout) — both tabs then light up for either page. */
  combinedView: boolean
  sampleCount: number
  onRecorded: (recording: PendingRecording) => void
}

/**
 * Bottom bar, in the thumb zone: the three destinations plus hold-to-record
 * dead center, with its mic/mix source switch beside it.
 */
export function TabBar({ combinedView, sampleCount, onRecorded }: TabBarProps) {
  const { page, goToPads, goToSequencer, goToLibrary } = useNavigation()
  const studio = page === 'pads' || page === 'sequencer'
  const padsActive = combinedView ? studio : page === 'pads'
  const seqActive = combinedView ? studio : page === 'sequencer'

  return (
    <nav className="tabbar" aria-label="Pages">
      <button type="button" className={padsActive ? 'tab on' : 'tab'} onClick={goToPads} aria-current={padsActive ? 'page' : undefined}>
        <PadsIcon />
        <span className="tab-label">Pads</span>
      </button>
      <button type="button" className={seqActive ? 'tab on' : 'tab'} onClick={goToSequencer} aria-current={seqActive ? 'page' : undefined}>
        <SeqIcon />
        <span className="tab-label">Seq</span>
      </button>
      <div className="tab-record">
        <RecordButton sampleCount={sampleCount} onRecorded={onRecorded} />
      </div>
      <button type="button" className={page === 'library' ? 'tab on' : 'tab'} onClick={goToLibrary} aria-current={page === 'library' ? 'page' : undefined}>
        <LibraryIcon />
        <span className="tab-label">Library</span>
      </button>
      <RecordSourceToggle />
    </nav>
  )
}
