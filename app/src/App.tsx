import { useState, type ReactNode } from 'react'
import { DialPanel } from './components/DialPanel'
import { Library } from './components/Library'
import { PadGrid } from './components/PadGrid'
import { Recorder } from './components/Recorder'
import { Sequencer } from './components/Sequencer'
import { TransportBar } from './components/TransportBar'
import { useBeatEngine } from './hooks/useBeatEngine'
import { useWarnBeforeUnload } from './hooks/useWarnBeforeUnload'
import { AppStateProvider, useAppState } from './state/AppStateContext'
import { EngineProvider } from './state/EngineContext'

function EngineBridge({ children }: { children: ReactNode }) {
  const { state, dispatch } = useAppState()
  const engine = useBeatEngine(state, dispatch)
  return <EngineProvider engine={engine}>{children}</EngineProvider>
}

function Shell() {
  const { state } = useAppState()
  const [selectedPadId, setSelectedPadId] = useState<string | null>(null)
  useWarnBeforeUnload(Object.keys(state.samples).length > 0)

  return (
    <main className="app-shell">
      <header>
        <h1>Beat Maker</h1>
        <p className="muted">
          Session-only — nothing is saved. Reload or Clear All for a blank slate.
        </p>
      </header>

      <div className="row">
        <Recorder />
        <Library />
      </div>

      <div className="row">
        <PadGrid selectedPadId={selectedPadId} onSelectPad={setSelectedPadId} />
        <DialPanel padId={selectedPadId} />
      </div>

      <Sequencer />
      <TransportBar />
    </main>
  )
}

function App() {
  return (
    <AppStateProvider>
      <EngineBridge>
        <Shell />
      </EngineBridge>
    </AppStateProvider>
  )
}

export default App
