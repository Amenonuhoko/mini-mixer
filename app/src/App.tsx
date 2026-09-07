import { useState, type ReactNode } from 'react'
import { Library } from './components/Library'
import { MetronomeButton } from './components/MetronomeButton'
import { Nav } from './components/Nav'
import { PadEditPage } from './components/PadEditPage'
import { PadsPage } from './components/PadsPage'
import { PlayBar } from './components/PlayBar'
import { RecordFAB } from './components/RecordFAB'
import { RecordingReviewOverlay } from './components/RecordingReviewOverlay'
import type { PendingRecording } from './components/RecordingReview'
import { Sequencer } from './components/Sequencer'
import { SettingsOverlay } from './components/SettingsOverlay'
import { useAutosave } from './hooks/useAutosave'
import { useBeatEngine } from './hooks/useBeatEngine'
import { AppStateProvider, useAppState } from './state/AppStateContext'
import { EngineProvider, useEngine } from './state/EngineContext'
import { NavigationProvider, useNavigation } from './state/NavigationContext'

function EngineBridge({ children }: { children: ReactNode }) {
  const { state, dispatch } = useAppState()
  const engine = useBeatEngine(state, dispatch)
  return <EngineProvider engine={engine}>{children}</EngineProvider>
}

function CurrentPage() {
  const { page } = useNavigation()
  switch (page) {
    case 'pads':
      return <PadsPage />
    case 'edit-pad':
      return <PadEditPage />
    case 'sequencer':
      return <Sequencer />
    case 'library':
      return <Library />
  }
}

function Shell() {
  const { state, dispatch } = useAppState()
  const { page } = useNavigation()
  const engine = useEngine()
  const [pendingRecording, setPendingRecording] = useState<PendingRecording | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  useAutosave(state, dispatch, engine)

  // Play/pause, BPM, and loop-mode are all specifically about sequencer pattern
  // playback — meaningless while just tapping/looping pads by hand — so the play
  // bar is a real transport bar that only exists on the Sequencer page, not a
  // global bit of chrome. It keeps playing in the background if you navigate
  // away; pausing just requires coming back to Sequencer. --playbar-height drives
  // both the app-shell's reserved bottom padding and the FAB cluster's vertical
  // offset, so collapsing it to 0 here (rather than only hiding <PlayBar/>) makes
  // both close the gap automatically instead of leaving dead space behind.
  const showPlayBar = page === 'sequencer'

  return (
    <div style={{ '--playbar-height': showPlayBar ? '76px' : '0px' } as React.CSSProperties}>
      <Nav onOpenSettings={() => setSettingsOpen(true)} />
      <main className="app-shell">
        <CurrentPage />
      </main>
      {showPlayBar && <PlayBar />}
      <div className="fab-cluster">
        <MetronomeButton />
        <RecordFAB
          sampleCount={Object.keys(state.samples).length}
          onRecorded={setPendingRecording}
        />
      </div>
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
