import { useNavigation } from '../state/NavigationContext'
import { LibraryIcon, PadsIcon, SeqIcon, SongIcon } from './icons'
import { PlayButton } from './PlayButton'
import { TransportCluster } from './TransportStrip'

interface TabBarProps {
  /** True when the screen can show Pads and Sequencer together (wide or landscape layout). */
  combinedView: boolean
}

/**
 * Bottom bar, in the thumb zone: the four destinations with Play raised
 * dead center — the button pressed most, right under the thumb — in a pill
 * with the metronome, master level and panic. (Recording lives on the Pads
 * page, next to the sounds it makes.)
 *
 * On a screen wide enough for both, Pads and Seq are one studio and the two
 * tabs light together; each panel's own header holds the control that gives
 * it the whole window or brings the other back (StudioViewToggle). A tab
 * still always reveals the panel it names: tapping Pads while the sequencer
 * has the window brings the pads back beside it. The groups either side of
 * Play mirror each other, so Play stays centred.
 */
export function TabBar({ combinedView }: TabBarProps) {
  const { page, studioView, setStudioView, goToPads, goToSequencer, goToSong, goToLibrary } = useNavigation()
  const studio = page === 'pads' || page === 'sequencer'
  const padsActive = combinedView ? studio && studioView !== 'sequencer' : page === 'pads'
  const seqActive = combinedView ? studio && studioView !== 'pads' : page === 'sequencer'

  const showPads = () => {
    if (combinedView && studioView === 'sequencer') setStudioView('both')
    goToPads()
  }
  const showSequencer = () => {
    if (combinedView && studioView === 'pads') setStudioView('both')
    goToSequencer()
  }

  return (
    <nav className="tabbar" aria-label="Pages">
      <div className="tab-group tab-group-left">
        <button type="button" className={padsActive ? 'tab on' : 'tab'} onClick={showPads} aria-current={padsActive ? 'page' : undefined}>
          <PadsIcon />
          <span className="tab-label">Pads</span>
        </button>
        <button type="button" className={seqActive ? 'tab on' : 'tab'} onClick={showSequencer} aria-current={seqActive ? 'page' : undefined}>
          <SeqIcon />
          <span className="tab-label">Seq</span>
        </button>
      </div>
      <TransportCluster>
        <PlayButton />
      </TransportCluster>
      <div className="tab-group tab-group-right">
        <button type="button" className={page === 'song' ? 'tab on' : 'tab'} onClick={goToSong} aria-current={page === 'song' ? 'page' : undefined}>
          <SongIcon />
          <span className="tab-label">Song</span>
        </button>
        <button type="button" className={page === 'library' ? 'tab on' : 'tab'} onClick={goToLibrary} aria-current={page === 'library' ? 'page' : undefined}>
          <LibraryIcon />
          <span className="tab-label">Library</span>
        </button>
      </div>
    </nav>
  )
}
