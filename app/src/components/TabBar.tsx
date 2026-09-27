import { useNavigation } from '../state/NavigationContext'
import { LibraryIcon, PadsIcon, SeqIcon, SongIcon, SplitIcon } from './icons'
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
 * On a screen wide enough for both, the studio has three views: Pads or
 * Seq alone with the whole window, or Both — the docked split — which is
 * the tab between them. The groups either side of Play mirror each other,
 * so Play stays centred whether Both is there or not.
 */
export function TabBar({ combinedView }: TabBarProps) {
  const { page, studioView, setStudioView, goToPads, goToSequencer, goToSong, goToLibrary } = useNavigation()
  const studio = page === 'pads' || page === 'sequencer'
  const padsActive = combinedView ? studio && studioView !== 'sequencer' : page === 'pads'
  const seqActive = combinedView ? studio && studioView !== 'pads' : page === 'sequencer'
  const bothActive = combinedView && studio && studioView === 'both'

  const showPads = () => {
    if (combinedView) setStudioView('pads')
    goToPads()
  }
  const showSequencer = () => {
    if (combinedView) setStudioView('sequencer')
    goToSequencer()
  }
  const showBoth = () => {
    setStudioView('both')
    if (!studio) goToPads()
  }

  return (
    <nav className="tabbar" aria-label="Pages">
      <div className="tab-group tab-group-left">
        <button type="button" className={padsActive ? 'tab on' : 'tab'} onClick={showPads} aria-current={padsActive ? 'page' : undefined} title={combinedView ? 'Pads on their own' : undefined}>
          <PadsIcon />
          <span className="tab-label">Pads</span>
        </button>
        {combinedView && (
          <button type="button" className={bothActive ? 'tab tab-both on' : 'tab tab-both'} onClick={showBoth} aria-current={bothActive ? 'page' : undefined} title="Sequencer above, pads below">
            <SplitIcon />
            <span className="tab-label">Both</span>
          </button>
        )}
        <button type="button" className={seqActive ? 'tab on' : 'tab'} onClick={showSequencer} aria-current={seqActive ? 'page' : undefined} title={combinedView ? 'Sequencer on its own' : undefined}>
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
