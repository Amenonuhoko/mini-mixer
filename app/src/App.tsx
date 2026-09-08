import { useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { Library } from './components/Library'
import { MetronomeButton } from './components/MetronomeButton'
import { MasterVolumeButton } from './components/MasterVolumeButton'
import { Nav } from './components/Nav'
import { PadEditOverlay } from './components/PadEditOverlay'
import { PadsPage } from './components/PadsPage'
import { PlayBar } from './components/PlayBar'
import { RecordFAB } from './components/RecordFAB'
import { RecordingReviewOverlay } from './components/RecordingReviewOverlay'
import type { PendingRecording } from './components/RecordingReview'
import { Sequencer } from './components/Sequencer'
import { SettingsOverlay } from './components/SettingsOverlay'
import { useAutosave } from './hooks/useAutosave'
import { useBeatEngine } from './hooks/useBeatEngine'
import { useIsWideScreen } from './hooks/useIsWideScreen'
import { AppStateProvider, useAppState } from './state/AppStateContext'
import { EngineProvider, useEngine } from './state/EngineContext'
import { NavigationProvider, useNavigation } from './state/NavigationContext'

function EngineBridge({ children }: { children: ReactNode }) {
  const { state, dispatch } = useAppState()
  const engine = useBeatEngine(state, dispatch)
  return <EngineProvider engine={engine}>{children}</EngineProvider>
}

/**
 * Above the wide-screen breakpoint, Pads and Sequencer are shown together
 * side by side instead of as separate pages — they're the two screens you go
 * back and forth between while actually playing/building a beat, unlike
 * Library, which stays a full-width page even when wide since it's more of
 * an occasional-visit browsing screen. The nav tabs still work as before;
 * on a wide screen, switching to either "Pads" or "Sequencer" shows both.
 */
interface CurrentPageProps {
  onBounced: (recording: PendingRecording) => void
}

function CurrentPage({ onBounced }: CurrentPageProps) {
  const { page } = useNavigation()
  const isWide = useIsWideScreen()

  if (isWide && (page === 'pads' || page === 'sequencer')) {
    return (
      <div className="wide-split">
        <PadsPage />
        <Sequencer onBounced={onBounced} />
      </div>
    )
  }

  switch (page) {
    case 'pads':
      return <PadsPage />
    case 'sequencer':
      return <Sequencer onBounced={onBounced} />
    case 'library':
      return <Library />
  }
}

function Shell() {
  const { state, dispatch } = useAppState()
  const { page, editingPadId, goBackFromEdit, goToPads, goToSequencer } = useNavigation()
  const engine = useEngine()
  const [pendingRecording, setPendingRecording] = useState<PendingRecording | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  useAutosave(state, dispatch, engine)


  const isWide = useIsWideScreen()
  // Play/pause, BPM, and loop-mode are all specifically about sequencer pattern
  // playback — meaningless while just tapping/looping pads by hand — so the play
  // bar is a real transport bar that only shows when the Sequencer is actually
  // visible, not a global bit of chrome. On a wide screen the Sequencer is also
  // visible while the "Pads" tab is selected (see CurrentPage's side-by-side
  // layout), so the bar needs to show there too. It keeps playing in the
  // background if you navigate away on a narrow screen; pausing just requires
  // coming back to Sequencer. --playbar-height drives both the app-shell's
  // reserved bottom padding and the FAB cluster's vertical offset, so collapsing
  // it to 0 here (rather than only hiding <PlayBar/>) makes both close the gap
  // automatically instead of leaving dead space behind.
  const showPlayBar = isWide ? page === 'pads' || page === 'sequencer' : page === 'sequencer'

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (isWide || (page !== 'pads' && page !== 'sequencer')) return
    const touch = event.touches[0]
    if (touch) swipeStart.current = { x: touch.clientX, y: touch.clientY }
  }

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start || isWide || (page !== 'pads' && page !== 'sequencer')) return
    const touch = event.changedTouches[0]
    if (!touch) return
    const horizontalDistance = touch.clientX - start.x
    const verticalDistance = touch.clientY - start.y
    // A deliberate horizontal swipe only: keep normal vertical scrolling and
    // ordinary pad taps untouched.
    if (Math.abs(horizontalDistance) < 72 || Math.abs(horizontalDistance) <= Math.abs(verticalDistance)) {
      return
    }
    if (page === 'pads' && horizontalDistance < 0) goToSequencer()
    if (page === 'sequencer' && horizontalDistance > 0) goToPads()
  }

  return (
    <div style={{ '--playbar-height': showPlayBar ? '76px' : '0px' } as React.CSSProperties}>
      <Nav onOpenSettings={() => setSettingsOpen(true)} />
      <main
        className={page === 'library' ? 'app-shell library-shell' : 'app-shell'}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <CurrentPage onBounced={setPendingRecording} />
      </main>
      {showPlayBar && <PlayBar />}
      <div className="fab-cluster">
        <MasterVolumeButton />
        <MetronomeButton />
        <RecordFAB
          sampleCount={Object.keys(state.samples).length}
          onRecorded={setPendingRecording}
        />
      </div>
      {editingPadId !== null && <PadEditOverlay onClose={goBackFromEdit} />}
      {pendingRecording && (
        <RecordingReviewOverlay
          recording={pendingRecording}
          onDone={() => setPendingRecording(null)}
        />
      )}
      {settingsOpen && <SettingsOverlay onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function App() {
  return (
    <AppStateProvider>
      <EngineBridge>
        <NavigationProvider>
          <Shell />
        </NavigationProvider>
      </EngineBridge>
    </AppStateProvider>
  )
}

export default App
