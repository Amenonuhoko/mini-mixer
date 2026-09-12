import { useRef, useState } from 'react'
import { usePadLooping } from '../hooks/usePadLooping'
import { renderPatternToBuffer } from '../engine/bouncePattern'
import { MAX_PAD_COUNT, MIN_PAD_COUNT, MAX_STEP_COUNT, MIN_STEP_COUNT } from '../state/constants'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { contrastingTextColor } from '../utils/color'
import { computePeaks } from '../utils/waveform'
import type { AudioEngine } from '../engine/AudioEngine'
import type { Pad, Sample, SequenceTrace, Transport } from '../state/types'
import { ConfirmDialog } from './ConfirmDialog'
import { LoopPresetMenuButton } from './LoopPresetMenuButton'
import { PadLibraryPicker } from './PadLibraryPicker'
import { SequenceLoadPicker } from './SequenceLoadPicker'
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
  const [sequencerGateMode, setSequencerGateMode] = useState(false)
  const [previewOnClick, setPreviewOnClick] = useState(true)
  const [removingPadId, setRemovingPadId] = useState<string | null>(null)
  const [loadPickerOpen, setLoadPickerOpen] = useState(false)
  const removingPad = removingPadId ? state.pads.find((pad) => pad.id === removingPadId) : undefined
  const removingPadIndex = removingPad ? visiblePads.indexOf(removingPad) : -1

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
          Array.from({ length: pattern.stepCount }, (_, stepIndex) => pattern.steps[pad.id]?.[stepIndex] ?? null),
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

  const handleTimelineWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.shiftKey) return
    const timeline = event.currentTarget
    if (timeline.scrollWidth <= timeline.clientWidth) return
    event.preventDefault()
    timeline.scrollLeft += event.deltaX || event.deltaY
  }

  if (!pattern) return null

  return (
    <section className={pattern.stepCount <= 16 ? 'panel sequencer sequencer-fits-desktop' : 'panel sequencer'} aria-label="sequencer">
      <div className="sequencer-header">
        <h2>Sequencer — {pattern.name}</h2>
        <LoopPresetMenuButton />
      </div>
      <p className="muted sequencer-hint">Swipe sideways for all 16 steps on narrow screens.</p>
      <div className="step-length-controls step-length-controls-left" aria-label="Pattern length">
        <button
          type="button"
          className="step-add-right"
          onClick={() => dispatch({ type: 'REMOVE_PATTERN_STEPS', patternId: pattern.id })}
          disabled={pattern.stepCount <= MIN_STEP_COUNT}
          title={pattern.stepCount <= MIN_STEP_COUNT ? 'A pattern needs at least 4 steps' : 'Remove the last four steps'}
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
      <div className="sequencer-gate-control">
        <button
          type="button"
          className={sequencerGateMode ? 'btn btn-secondary sequencer-gate-toggle armed' : 'btn btn-secondary sequencer-gate-toggle'}
          onClick={() => setSequencerGateMode((enabled) => !enabled)}
          aria-pressed={sequencerGateMode}
          title={sequencerGateMode ? 'Hold a sequencer cell to hear a gated note; click to turn Gate off' : 'Turn on Gate to hear notes only while holding a sequencer cell'}
        >
          {sequencerGateMode ? 'Gate on' : 'Gate'}
        </button>
        <button
          type="button"
          className={previewOnClick ? 'btn btn-secondary sequencer-preview-toggle' : 'btn btn-secondary sequencer-preview-toggle off'}
          onClick={() => setPreviewOnClick((enabled) => !enabled)}
          aria-pressed={previewOnClick}
          title={previewOnClick ? 'Filling a step plays it once — click to stop previewing on fill' : 'Preview off — filling a step stays silent'}
        >
          {previewOnClick ? 'Preview on' : 'Preview off'}
        </button>
      </div>
        <div className="sequencer-scroll" onWheel={handleTimelineWheel}>
      <div className="sequencer-floating-actions">
        <button
          type="button"
          className="btn btn-secondary sequencer-bounce"
          onClick={() => void handleBounce()}
          disabled={!patternHasSteps || bouncing}
          title={patternHasSteps ? 'Save this sequence, then choose an existing or new pad' : 'Program a step first'}
        >
          {bouncing ? 'Saving…' : 'Save sequence'}
        </button>
        <button
          type="button"
          className="btn btn-secondary sequencer-load"
          onClick={() => setLoadPickerOpen(true)}
          title="Load a previously saved sequence into this pattern"
        >
          Load sequence
        </button>
        <button
          type="button"
          className="btn btn-secondary sequencer-trace"
          onClick={() =>
            dispatch({
              type: pattern.traceSource === 'hidden' ? 'RESTORE_PATTERN_TRACE' : 'CAPTURE_PATTERN_TRACE',
              patternId: pattern.id,
            })
          }
          disabled={pattern.traceSource !== 'hidden' && !patternHasSteps}
          title={
            pattern.traceSource === 'hidden'
              ? 'Restore this hidden sequence to playback'
              : patternHasSteps
                ? 'Hide this sequence while retaining it as a visual guide'
                : 'Program a step first'
          }
        >
          {pattern.traceSource === 'hidden' ? 'Show sequence' : 'Hide sequence'}
        </button>
        {pattern.traceSteps && (
          <button
            type="button"
            className="btn btn-secondary sequencer-trace"
            onClick={() => dispatch({ type: 'CLEAR_PATTERN_TRACE', patternId: pattern.id })}
            title="Remove the visual trace"
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
        {confirmClear && (
          <ConfirmDialog
            message="Clear every step in this pattern? This can't be undone."
            confirmLabel="Clear"
            onConfirm={() => {
              dispatch({ type: 'CLEAR_PATTERN', patternId: pattern.id })
              setConfirmClear(false)
            }}
            onCancel={() => setConfirmClear(false)}
          />
        )}
        </div>
        <div className="sequencer-grid">
          <div className="sequencer-row sequencer-header-row">
            <div className="sequencer-row-fixed">
              <span className="sequencer-row-remove sequencer-row-remove-spacer" />
              <span className="sequencer-row-label sequencer-row-label-spacer" />
            </div>
            {chunk(
              Array.from({ length: pattern.stepCount }, (_, i) => i),
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
              steps={pattern.steps[pad.id] ?? new Array<string | null>(pattern.stepCount).fill(null)}
              traceSteps={pattern.traceSteps?.[pad.id] ?? []}
              sampleLabels={Object.fromEntries(Object.entries(state.samples).map(([id, sample]) => [id, sample.label]))}
              transport={state.transport}
              engine={engine}
              sample={pad.sampleId ? state.samples[pad.sampleId] : undefined}
              gateMode={sequencerGateMode}
              previewOnClick={previewOnClick}
              onToggleStep={(stepIndex) =>
                dispatch({ type: 'TOGGLE_STEP', patternId: pattern.id, padId: pad.id, stepIndex, sampleId: pad.sampleId })
              }
              onFillStep={(stepIndex) => {
                if (!pad.sampleId) return
                dispatch({ type: 'SET_STEP_SAMPLE', patternId: pattern.id, padId: pad.id, stepIndex, sampleId: pad.sampleId })
              }}
              onSwapSound={() => setSwappingPadId(pad.id)}
              onRemove={() => setRemovingPadId(pad.id)}
              removeDisabled={state.pads.length <= MIN_PAD_COUNT}
            />
          ))}
          {state.visiblePadCount < MAX_PAD_COUNT && (
            <div className="sequencer-add-row-slot">
              <div className="sequencer-row-fixed">
                <span className="sequencer-row-remove sequencer-row-remove-spacer" />
                <span className="sequencer-row-label sequencer-row-label-spacer" />
              </div>
              <button
                type="button"
                className="sequencer-add-row"
                onClick={() => dispatch({ type: 'SET_VISIBLE_PAD_COUNT', count: state.visiblePadCount + 1 })}
              >
                + Add row
              </button>
            </div>
          )}
        </div>

      </div>
      {swappingPadId && (
        <PadLibraryPicker padId={swappingPadId} onClose={() => setSwappingPadId(null)} />
      )}
      {loadPickerOpen && <SequenceLoadPicker onClose={() => setLoadPickerOpen(false)} />}
      {removingPad && (
        <ConfirmDialog
          message={`Remove Pad ${removingPadIndex + 1} from the sequencer? Its programmed steps go with it — its sample stays in the library, and every other row is unaffected.`}
          confirmLabel="Remove"
          onConfirm={() => {
            dispatch({ type: 'REMOVE_PAD', padId: removingPad.id })
            setRemovingPadId(null)
          }}
          onCancel={() => setRemovingPadId(null)}
        />
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
  sample: Sample | undefined
  gateMode: boolean
  previewOnClick: boolean
  onToggleStep: (stepIndex: number) => void
  onFillStep: (stepIndex: number) => void
  onSwapSound: () => void
  onRemove: () => void
  removeDisabled: boolean
}

function SequencerRow({
  pad,
  padIndex,
  steps,
  traceSteps,
  sampleLabels,
  transport,
  engine,
  sample,
  gateMode,
  previewOnClick,
  onToggleStep,
  onFillStep,
  onSwapSound,
  onRemove,
  removeDisabled,
}: SequencerRowProps) {
  const looping = usePadLooping(engine, pad.id)
  const gateSources = useRef(new Map<number, AudioBufferSourceNode>())
  const rowRef = useRef<HTMLDivElement>(null)
  // A drag across several cells ("slide an instrument across multiple
  // beats") vs. a plain tap on one — tracked per-gesture so a real drag can
  // suppress the click event the browser still fires on the origin cell
  // afterward, without a second, spurious toggle undoing what the drag just
  // painted there.
  const paintRef = useRef<{ originIndex: number; painted: boolean } | null>(null)

  const stopGateSource = (pointerId: number) => {
    const source = gateSources.current.get(pointerId)
    if (!source) return
    try {
      source.stop()
    } catch {
      // A short sound may have ended between press and release.
    }
    gateSources.current.delete(pointerId)
  }

  const startGate = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!gateMode || !sample || pad.muted) return
    event.currentTarget.setPointerCapture(event.pointerId)
    gateSources.current.set(event.pointerId, engine.triggerPad(pad, sample.buffer))
  }

  const fillAndAudition = (event: React.MouseEvent<HTMLButtonElement>, on: boolean, stepIndex: number) => {
    if (paintRef.current?.painted) {
      // The drag already set this exact cell's final state; the click the
      // browser fires right after pointerup on the same element is not a
      // second, independent tap and must not toggle it back.
      paintRef.current = null
      return
    }
    paintRef.current = null
    onToggleStep(stepIndex)
    if (on || !sample || pad.muted || !previewOnClick) return
    // In Gate mode the note began on pointer-down and is stopped by release.
    // Keyboard activation has no pointer lifecycle, so give it a normal audition.
    if (!gateMode || event.detail === 0) engine.triggerPad(pad, sample.buffer)
  }

  // Dragging fills a run of cells on, the same direction a plain tap-to-fill
  // already goes — a drag never erases, so the result of painting across a
  // mix of on/off cells is always predictable. Only active outside Gate
  // mode, which already owns the pointer-hold gesture for live audition.
  const startPaint = (event: React.PointerEvent<HTMLButtonElement>, stepIndex: number) => {
    if (gateMode || !sample || pad.muted) return
    paintRef.current = { originIndex: stepIndex, painted: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const continuePaint = (event: React.PointerEvent<HTMLButtonElement>) => {
    const paint = paintRef.current
    if (!paint || gateMode) return
    const target = document.elementFromPoint(event.clientX, event.clientY)
    const stepEl = target instanceof Element ? target.closest<HTMLElement>('[data-step-index]') : null
    if (!stepEl || !rowRef.current?.contains(stepEl)) return
    const stepIndex = Number(stepEl.dataset.stepIndex)
    if (stepIndex === paint.originIndex && !paint.painted) return
    paint.painted = true
    onFillStep(stepIndex)
  }

  const endPaint = () => {
    const paint = paintRef.current
    if (paint?.painted) onFillStep(paint.originIndex)
  }

  return (
    <div className={looping ? 'sequencer-row row-looping' : 'sequencer-row'} ref={rowRef}>
      <div className="sequencer-row-fixed">
        <button
          type="button"
          className="sequencer-row-remove"
          onClick={onRemove}
          disabled={removeDisabled}
          aria-label={`Remove Pad ${padIndex + 1} from the sequencer`}
          title={removeDisabled ? 'At least one pad must remain' : 'Remove this row from the sequencer'}
        >
          ✕
        </button>
        <button
          type="button"
          className="sequencer-row-label"
          style={{ background: pad.color, color: contrastingTextColor(pad.color) }}
          onClick={onSwapSound}
          title="Load or replace this row’s pad sound"
        >
          <span>{padIndex + 1}</span>
          <span className="sequencer-row-load">Load</span>
          {looping && <span className="row-loop-badge" aria-hidden="true" />}
        </button>
      </div>
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
                data-step-index={stepIndex}
                className={[
                  'step',
                  on ? 'on' : '',
                  traced ? 'trace' : '',
                  stepIndex === transport.currentStep && transport.isPlaying ? 'current' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={on ? { background: pad.color } : traced ? { borderColor: pad.color } : undefined}
                onPointerDown={(event) => {
                  startGate(event)
                  startPaint(event, stepIndex)
                }}
                onPointerMove={continuePaint}
                onPointerUp={(event) => {
                  stopGateSource(event.pointerId)
                  endPaint()
                }}
                onPointerCancel={(event) => {
                  stopGateSource(event.pointerId)
                  endPaint()
                }}
                onClick={(event) => fillAndAudition(event, on, stepIndex)}
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
