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
import { useBeatEngine } from './hooks/useBeatEngine'
import { useWarnBeforeUnload } from './hooks/useWarnBeforeUnload'
import { AppStateProvider, useAppState } from './state/AppStateContext'
import { EngineProvider } from './state/EngineContext'
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
  const { state } = useAppState()
  const [pendingRecording, setPendingRecording] = useState<PendingRecording | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  useWarnBeforeUnload(Object.keys(state.samples).length > 0)

  return (
    <>
      <Nav onOpenSettings={() => setSettingsOpen(true)} />
      <main className="app-shell">
        <CurrentPage />
      </main>
      <PlayBar />
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
    </>
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
