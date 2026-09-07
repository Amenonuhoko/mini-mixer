import { STEP_COUNT } from '../state/constants'
import { useAppState } from '../state/AppStateContext'

export function Sequencer() {
  const { state, dispatch } = useAppState()
  const pattern = state.patterns.find((p) => p.id === state.activePatternId)
  const visiblePads = state.pads.slice(0, state.visiblePadCount)

  if (!pattern) return null

  return (
    <section className="panel sequencer" aria-label="sequencer">
      <h2>Sequencer — {pattern.name}</h2>
      <div className="sequencer-grid">
        {visiblePads.map((pad) => {
          const steps = pattern.steps[pad.id] ?? new Array<boolean>(STEP_COUNT).fill(false)
          return (
            <div className="sequencer-row" key={pad.id}>
              <span className="sequencer-row-label" style={{ color: pad.color }}>
                ●
              </span>
              {steps.map((on, stepIndex) => (
                <button
                  key={stepIndex}
                  type="button"
                  className={[
                    'step',
                    on ? 'on' : '',
                    stepIndex === state.transport.currentStep && state.transport.isPlaying
                      ? 'current'
                      : '',
                    stepIndex % 4 === 0 ? 'beat-start' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={on ? { background: pad.color } : undefined}
                  onClick={() =>
                    dispatch({
                      type: 'TOGGLE_STEP',
                      patternId: pattern.id,
                      padId: pad.id,
                      stepIndex,
                    })
                  }
                  aria-label={`step ${stepIndex + 1} for pad ${pad.id}`}
                />
              ))}
            </div>
          )
        })}
      </div>
    </section>
  )
}
