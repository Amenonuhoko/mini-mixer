import { AppStateProvider, useAppState } from './state/AppStateContext'
import { BPM_MAX, BPM_MIN } from './state/constants'

function Shell() {
  const { state, dispatch } = useAppState()
  const visiblePads = state.pads.slice(0, state.visiblePadCount)

  return (
    <main style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
      <h1>Beat Maker</h1>
      <p>
        Scaffold online — data model, reducer, and audio engine are wired up. Recording, dials, and
        the sequencer grid are still to come.
      </p>

      <section aria-label="tempo">
        <label htmlFor="bpm">
          BPM: {state.transport.bpm} ({BPM_MIN}-{BPM_MAX})
        </label>
        <input
          id="bpm"
          type="range"
          min={BPM_MIN}
          max={BPM_MAX}
          value={state.transport.bpm}
          onChange={(event) => dispatch({ type: 'SET_BPM', bpm: Number(event.target.value) })}
        />
      </section>

      <section aria-label="pads">
        <h2>Pads ({state.visiblePadCount})</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {visiblePads.map((pad, index) => (
            <div
              key={pad.id}
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                background: pad.color,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
              }}
              title={pad.sampleId ? 'Assigned' : 'Empty'}
            >
              {index + 1}
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  )
}

export default App
