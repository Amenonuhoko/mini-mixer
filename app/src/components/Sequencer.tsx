import { useState } from 'react'
import { usePadLooping } from '../hooks/usePadLooping'
import { renderPatternToBuffer } from '../engine/bouncePattern'
import { MAX_PAD_COUNT, MAX_STEP_COUNT } from '../state/constants'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { contrastingTextColor } from '../utils/color'
import { computePeaks } from '../utils/waveform'
import type { AudioEngine } from '../engine/AudioEngine'
import type { Pad, SequenceTrace, Transport } from '../state/types'
import { PadLibraryPicker } from './PadLibraryPicker'
import type { PendingRecording } from './RecordingReview'

const GROUP_SIZE = 4
const WAVEFORM_BUCKETS = 80

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = []
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size))
  return groups
}

/**
 * The 16-step grid, restyled to read as a continuous timeline (bar lines
 * between beat groups, a glowing playhead cell) rather than a plain checkbox
 * grid — see .step-group/.step in index.css. Each row is one pad; tapping its
 * color swatch opens the same PadLibraryPicker the Pads page uses, so you can
 * swap what a row plays without leaving the Sequencer. "Add row" grows
 * visiblePadCount by one, the same mechanism Settings' pad-count stepper uses.
 * "Bounce to Pad" renders the pattern exactly as programmed (mute/trim/
 * effects/mix level respected) down to one sample via engine/bouncePattern.ts,
 * completing the pad -> beat -> sequence -> pad loop.
 */
interface SequencerProps {
  onBounced: (recording: PendingRecording) => void
}

export function Sequencer({ onBounced }: SequencerProps) {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const pattern = state.patterns.find((p) => p.id === state.activePatternId)
  const visiblePads = state.pads.slice(0, state.visiblePadCount)
  const [swappingPadId, setSwappingPadId] = useState<string | null>(null)
  const [bouncing, setBouncing] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const patternHasSteps = pattern
    ? visiblePads.some((pad) => (pattern.steps[pad.id] ?? []).some((sampleId) => sampleId !== null))
    : false

  const handleBounce = async () => {
    if (!pattern || bouncing) return
    setBouncing(true)
    try {
      const buffer = await renderPatternToBuffer(state, pattern.id)
      const peaks = computePeaks(buffer, WAVEFORM_BUCKETS)
      const sequenceTrace: SequenceTrace = {
        stepCount: pattern.stepCount,
        rows: visiblePads.map((pad) =>
          Array.from(
            { length: pattern.stepCount },
            (_, stepIndex) => (pattern.steps[pad.id]?.[stepIndex] ?? null) !== null,
          ),
        ),
      }
      const recording = {
        label: `Bounce ${Object.keys(state.samples).length + 1}`,
        buffer,
        peaks,
        kind: 'sequence' as const,
        sequenceTrace,
      }
      onBounced(recording)
    } catch {
      // Pattern had no active steps — nothing to bounce. The button is
      // already disabled for this case; a race (steps cleared mid-render) is
      // rare enough to just silently no-op rather than surface an error.
    } finally {
      setBouncing(false)
    }
  }

  if (!pattern) return null

  return (
    <section className="panel sequencer" aria-label="sequencer">
      <h2>Sequencer — {pattern.name}</h2>
      <p className="muted sequencer-hint">Swipe sideways for all 16 steps on narrow screens.</p>
      <div className="sequencer-scroll">
        <div className="sequencer-grid">
          <div className="sequencer-row sequencer-header-row">
            <span className="sequencer-row-label sequencer-row-label-spacer" />
            {chunk(
              Array.from({ length: pattern.stepCount }, (_, i) => i),
              GROUP_SIZE,
            ).map((group, gi) => (
              <div className="step-group" key={gi}>
                <span className="step-group-number">{group[0]! + 1}</span>
              </div>
            ))}
            <div className="step-length-controls">
              <button
                type="button"
                className="step-add-right"
                onClick={() => dispatch({ type: 'REMOVE_PATTERN_STEPS', patternId: pattern.id })}
                disabled={pattern.stepCount <= 16}
                title={pattern.stepCount <= 16 ? 'A pattern needs at least 16 steps' : 'Remove the last four steps'}
                aria-label="Remove four steps from the right"
              >
                −4
              </button>
              <button
                type="button"
                className="step-add-right"
                onClick={() => dispatch({ type: 'ADD_PATTERN_STEPS', patternId: pattern.id })}
                disabled={pattern.stepCount >= MAX_STEP_COUNT}
                title={pattern.stepCount >= MAX_STEP_COUNT ? 'Maximum pattern length reached' : 'Add four steps to the right'}
                aria-label="Add four steps to the right"
              >
                +4
              </button>
            </div>
          </div>
          {visiblePads.map((pad, padIndex) => (
            <SequencerRow
              key={pad.id}
              pad={pad}
              padIndex={padIndex}
              patternId={pattern.id}
              steps={pattern.steps[pad.id] ?? new Array<string | null>(pattern.stepCount).fill(null)}
              traceSteps={pattern.traceSteps?.[pad.id] ?? []}
              sampleLabels={Object.fromEntries(Object.entries(state.samples).map(([id, sample]) => [id, sample.label]))}
              transport={state.transport}
              engine={engine}
              onToggleStep={(stepIndex) =>
                dispatch({ type: 'TOGGLE_STEP', patternId: pattern.id, padId: pad.id, stepIndex, sampleId: pad.sampleId })
              }
              onSwapSound={() => setSwappingPadId(pad.id)}
            />
          ))}
        </div>
        <div className="sequencer-footer-actions">
        <button
          type="button"
          className="btn btn-secondary sequencer-add-row"
          onClick={() => dispatch({ type: 'SET_VISIBLE_PAD_COUNT', count: state.visiblePadCount + 1 })}
          disabled={state.visiblePadCount >= MAX_PAD_COUNT}
        >
          + Add row
        </button>
        <button
          type="button"
          className="btn btn-secondary sequencer-bounce"
          onClick={() => void handleBounce()}
          disabled={!patternHasSteps || bouncing}
          title={patternHasSteps ? 'Render this pattern to a new sample' : 'Program a step first'}
        >
          {bouncing ? 'Bouncing…' : 'Bounce to Pad'}
        </button>
        <button
          type="button"
          className="btn btn-secondary sequencer-trace"
          onClick={() => dispatch({ type: 'CAPTURE_PATTERN_TRACE', patternId: pattern.id })}
          disabled={!patternHasSteps}
          title={patternHasSteps ? 'Keep these placements as a visual-only guide' : 'Program a step first'}
        >
          Trace current
        </button>
        {pattern.traceSteps && (
          <button
            type="button"
            className="btn btn-secondary sequencer-trace"
            onClick={() => dispatch({ type: 'CLEAR_PATTERN_TRACE', patternId: pattern.id })}
            title="Hide and remove the visual trace"
          >
            Clear trace
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost-danger sequencer-clear"
          onClick={() => setConfirmClear(true)}
          disabled={!patternHasSteps}
          title={patternHasSteps ? 'Clear every programmed step in this pattern' : 'Nothing programmed yet'}
        >
          Clear Sequence
        </button>
        </div>
      </div>
      {confirmClear && (
        <div className="confirm-overwrite">
          <span>Clear every step in this pattern? This can't be undone.</span>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              dispatch({ type: 'CLEAR_PATTERN', patternId: pattern.id })
              setConfirmClear(false)
            }}
          >
            Clear
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirmClear(false)}>
            Cancel
          </button>
        </div>
      )}
      {swappingPadId && (
        <PadLibraryPicker padId={swappingPadId} onClose={() => setSwappingPadId(null)} />
      )}
    </section>
  )
}

interface SequencerRowProps {
  pad: Pad
  padIndex: number
  patternId: string
  steps: Array<string | null>
  traceSteps: Array<string | null>
  sampleLabels: Record<string, string>
  transport: Transport
  engine: AudioEngine
  onToggleStep: (stepIndex: number) => void
  onSwapSound: () => void
}

function SequencerRow({
  pad,
  padIndex,
  steps,
  traceSteps,
  sampleLabels,
  transport,
  engine,
  onToggleStep,
  onSwapSound,
}: SequencerRowProps) {
  const looping = usePadLooping(engine, pad.id)

  return (
    <div className={looping ? 'sequencer-row row-looping' : 'sequencer-row'}>
      <button
        type="button"
        className="sequencer-row-label"
        style={{ background: pad.color, color: contrastingTextColor(pad.color) }}
        onClick={onSwapSound}
        title="Tap to change this row's sound"
      >
        {padIndex + 1}
        {looping && <span className="row-loop-badge" aria-hidden="true" />}
      </button>
      {chunk(steps, GROUP_SIZE).map((group, groupIndex) => (
        <div className="step-group" key={groupIndex}>
          {group.map((sampleId, i) => {
            const stepIndex = groupIndex * GROUP_SIZE + i
            const on = sampleId !== null
            const traceSampleId = traceSteps[stepIndex] ?? null
            const traced = !on && traceSampleId !== null
            const sampleLabel = sampleId ? sampleLabels[sampleId] ?? 'deleted sample' : null
            const traceLabel = traceSampleId ? sampleLabels[traceSampleId] ?? 'deleted sample' : null
            return (
              <button
                key={stepIndex}
                type="button"
                className={[
                  'step',
                  on ? 'on' : '',
                  traced ? 'trace' : '',
                  stepIndex === transport.currentStep && transport.isPlaying ? 'current' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={on ? { background: pad.color } : traced ? { borderColor: pad.color } : undefined}
                onClick={() => onToggleStep(stepIndex)}
                aria-label={sampleLabel ? `step ${stepIndex + 1} for pad ${padIndex + 1}: ${sampleLabel}` : traceLabel ? `Trace at step ${stepIndex + 1} for pad ${padIndex + 1}: ${traceLabel}` : `step ${stepIndex + 1} for pad ${padIndex + 1}`}
                title={sampleLabel ? `Step ${stepIndex + 1}: ${sampleLabel}` : traceLabel ? `Trace: ${traceLabel}` : `Step ${stepIndex + 1}`}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
