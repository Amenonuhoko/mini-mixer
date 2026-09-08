import { useState, type ReactNode } from 'react'
import { GridModeButton } from './components/GridModeButton'
import { Library } from './components/Library'
import { MetronomeButton } from './components/MetronomeButton'
import { Nav } from './components/Nav'
import { PadEditOverlay } from './components/PadEditOverlay'
import { PadsPage } from './components/PadsPage'
import { PlayBar } from './components/PlayBar'
import { PlaythroughToggle } from './components/PlaythroughToggle'
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
  const { page, editingPadId, goBackFromEdit } = useNavigation()
  const engine = useEngine()
  const [pendingRecording, setPendingRecording] = useState<PendingRecording | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
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

  return (
    <div style={{ '--playbar-height': showPlayBar ? '76px' : '0px' } as React.CSSProperties}>
      <Nav onOpenSettings={() => setSettingsOpen(true)} />
      <main className="app-shell">
        <CurrentPage onBounced={setPendingRecording} />
      </main>
      {showPlayBar && <PlayBar />}
      <div className="fab-cluster">
        {/* The pad edit popup has its own pad-specific loop control (see the pad
            switcher strip in PadEditPage) — the global mode button would be
            redundant, even confusing, sitting right next to it, so it's the
            one FAB hidden while the popup is open. Record and Metronome stay
            reachable regardless, per the app's established "always reachable"
            principle for those two. */}
        {editingPadId === null && <GridModeButton />}
        <MetronomeButton />
        <PlaythroughToggle />
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
