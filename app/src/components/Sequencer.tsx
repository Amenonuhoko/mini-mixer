import { usePadLooping } from '../hooks/usePadLooping'
import { STEP_COUNT } from '../state/constants'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { contrastingTextColor } from '../utils/color'
import type { AudioEngine } from '../engine/AudioEngine'
import type { Pad, Transport } from '../state/types'

const GROUP_SIZE = 4

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = []
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size))
  return groups
}

export function Sequencer() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const pattern = state.patterns.find((p) => p.id === state.activePatternId)
  const visiblePads = state.pads.slice(0, state.visiblePadCount)

  if (!pattern) return null

  return (
    <section className="panel sequencer" aria-label="sequencer">
      <h2>Sequencer — {pattern.name}</h2>
      <p className="muted sequencer-hint">Swipe sideways for all 16 steps.</p>
      <div className="sequencer-scroll">
        <div className="sequencer-grid">
          <div className="sequencer-row sequencer-header-row" aria-hidden="true">
            <span className="sequencer-row-label sequencer-row-label-spacer" />
            {chunk(
              Array.from({ length: STEP_COUNT }, (_, i) => i),
              GROUP_SIZE,
            ).map((group, gi) => (
              <div className="step-group" key={gi}>
                <span className="step-group-number">{group[0]! + 1}</span>
              </div>
            ))}
          </div>
          {visiblePads.map((pad, padIndex) => (
            <SequencerRow
              key={pad.id}
              pad={pad}
              padIndex={padIndex}
              patternId={pattern.id}
              steps={pattern.steps[pad.id] ?? new Array<boolean>(STEP_COUNT).fill(false)}
              transport={state.transport}
              engine={engine}
              onToggleStep={(stepIndex) =>
                dispatch({ type: 'TOGGLE_STEP', patternId: pattern.id, padId: pad.id, stepIndex })
              }
            />
          ))}
        </div>
      </div>
    </section>
  )
}

interface SequencerRowProps {
  pad: Pad
  padIndex: number
  patternId: string
  steps: boolean[]
  transport: Transport
  engine: AudioEngine
  onToggleStep: (stepIndex: number) => void
}

function SequencerRow({
  pad,
  padIndex,
  steps,
  transport,
  engine,
  onToggleStep,
}: SequencerRowProps) {
  const looping = usePadLooping(engine, pad.id)

  return (
    <div className={looping ? 'sequencer-row row-looping' : 'sequencer-row'}>
      <span
        className="sequencer-row-label"
        style={{ background: pad.color, color: contrastingTextColor(pad.color) }}
      >
        {padIndex + 1}
        {looping && <span className="row-loop-badge" aria-hidden="true" />}
      </span>
      {chunk(steps, GROUP_SIZE).map((group, groupIndex) => (
        <div className="step-group" key={groupIndex}>
          {group.map((on, i) => {
            const stepIndex = groupIndex * GROUP_SIZE + i
            return (
              <button
                key={stepIndex}
                type="button"
                className={[
                  'step',
                  on ? 'on' : '',
                  stepIndex === transport.currentStep && transport.isPlaying ? 'current' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={on ? { background: pad.color } : undefined}
                onClick={() => onToggleStep(stepIndex)}
                aria-label={`step ${stepIndex + 1} for pad ${padIndex + 1}`}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
