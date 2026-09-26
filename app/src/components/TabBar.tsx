import { useNavigation } from '../state/NavigationContext'
import { LibraryIcon, PadsIcon, SeqIcon, SongIcon } from './icons'
import { PlayButton } from './PlayButton'
import { TransportCluster } from './TransportStrip'

interface TabBarProps {
  /** True when Pads and Sequencer are shown together (wide or landscape layout) — both tabs then light up for either page. */
  combinedView: boolean
}

/**
 * Bottom bar, in the thumb zone: the four destinations with Play raised
 * dead center — the button pressed most, right under the thumb — in a pill
 * with the metronome, master level and panic. (Recording lives on the Pads
 * page, next to the sounds it makes.)
 */
export function TabBar({ combinedView }: TabBarProps) {
  const { page, goToPads, goToSequencer, goToSong, goToLibrary } = useNavigation()
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
      <TransportCluster>
        <PlayButton />
      </TransportCluster>
      <button type="button" className={page === 'song' ? 'tab on' : 'tab'} onClick={goToSong} aria-current={page === 'song' ? 'page' : undefined}>
        <SongIcon />
        <span className="tab-label">Song</span>
      </button>
      <button type="button" className={page === 'library' ? 'tab on' : 'tab'} onClick={goToLibrary} aria-current={page === 'library' ? 'page' : undefined}>
        <LibraryIcon />
        <span className="tab-label">Library</span>
      </button>
    </nav>
  )
}
