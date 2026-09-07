import { useEffect, useState, type ReactNode } from 'react'
import { DialPanel } from './components/DialPanel'
import { Library } from './components/Library'
import { PadGrid } from './components/PadGrid'
import { PlayBar } from './components/PlayBar'
import { Recorder } from './components/Recorder'
import { Sequencer } from './components/Sequencer'
import { SettingsPanel } from './components/SettingsPanel'
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

  const visiblePads = state.pads.slice(0, state.visiblePadCount)

  // Keep a pad selected for the dial panel at all times, falling back to the
  // first visible pad if none is selected yet or the selected one was hidden
  // by shrinking the pad count.
  useEffect(() => {
    const stillVisible = visiblePads.some((pad) => pad.id === selectedPadId)
    if (!stillVisible) {
      setSelectedPadId(visiblePads[0]?.id ?? null)
    }
    // Only re-check when the set of visible pads changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePads.map((pad) => pad.id).join(',')])

  return (
    <>
      <main className="app-shell">
        <header>
          <h1>Beat Maker</h1>
          <p className="muted">
            Session-only — nothing is saved. Reload or Clear All for a blank slate.
          </p>
        </header>

        <Recorder />
        <Library />
        <PadGrid selectedPadId={selectedPadId} onSelectPad={setSelectedPadId} />
        <DialPanel padId={selectedPadId} />
        <Sequencer />
        <SettingsPanel />
      </main>
      <PlayBar />
    </>
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
