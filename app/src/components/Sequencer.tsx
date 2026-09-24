import { useRef, useState } from 'react'
import { usePadLooping } from '../hooks/usePadLooping'
import { renderPatternToBuffer } from '../engine/bouncePattern'
import { padLabel } from '../music/theory'
import { styleById } from '../styles/library'
import { BANK_NAMES, playablePads, visibleBankPads } from '../state/banks'
import { MAX_PAD_COUNT, MIN_PAD_COUNT, MAX_STEP_COUNT, MIN_STEP_COUNT } from '../state/constants'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { computePeaks } from '../utils/waveform'
import type { AudioEngine, Voice } from '../engine/AudioEngine'
import type { Bank, Pad, Sample, SequenceTrace } from '../state/types'
import { ConfirmDialog } from './ConfirmDialog'
import { CloseIcon, EyeIcon, OpenIcon, PlusIcon, SaveIcon, SparkIcon, TrashIcon } from './icons'
import { LayerStrip } from './LayerStrip'
import { StyleDock } from './StyleBrowser'
import { PadLibraryPicker } from './PadLibraryPicker'
import { SequenceLoadPicker } from './SequenceLoadPicker'
import type { PendingRecording } from './RecordingReview'
import { Stepper } from './Stepper'
import { SongArranger } from './SongArranger'

const GROUP_SIZE = 4
const WAVEFORM_BUCKETS = 80

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = []
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size))
  return groups
}

/**
 * The step sequencer module: a compact header (pattern, step count, loop
 * presets), one toolbar (entry behavior on the left, pattern actions on the
 * right), and the grid, read as a continuous timeline — beat groups set
 * apart, the playhead column lit. Rows are grouped by bank: Drums shows
 * every pad (its number chip opens the library picker to swap the sound);
 * a melodic bank lists its notes/chords highest first, labeled by name.
 * Each bank folds down to just the rows in use unless it's the bank being
 * played on the Pads page or was opened by hand. Every row chip glows with that pad's live level.
 * "Save" renders the pattern exactly as programmed (mute/trim/effects/mix
 * respected) down to one sample via engine/bouncePattern.ts, completing the
 * pad -> beat -> sequence -> pad loop.
 */
interface SequencerProps {
  onBounced: (recording: PendingRecording) => void
}

export function Sequencer({ onBounced }: SequencerProps) {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const pattern = state.patterns.find((p) => p.id === state.activePatternId)
  const visiblePads = playablePads(state)
  const [expandedOverride, setExpandedOverride] = useState<Record<string, boolean>>({})
  const [swappingPadId, setSwappingPadId] = useState<string | null>(null)
  const [bouncing, setBouncing] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [sequencerGateMode, setSequencerGateMode] = useState(false)
  const [previewOnClick, setPreviewOnClick] = useState(true)
  const [removingPadId, setRemovingPadId] = useState<string | null>(null)
  const [loadPickerOpen, setLoadPickerOpen] = useState(false)
  const [stylesOpen, setStylesOpen] = useState(false)
  const [stripOpen, setStripOpen] = useState<Record<string, boolean>>({})
  const [songArrangeOpen, setSongArrangeOpen] = useState(state.transport.playMode === 'song')
  const removingPad = removingPadId ? state.pads.find((pad) => pad.id === removingPadId) : undefined
  const removingPadIndex = removingPad ? visiblePads.indexOf(removingPad) : -1
  const editingSection = state.transport.auditionScope === 'loop'
    ? state.songSections.find((section) => section.id === state.transport.auditionSectionId)
    : undefined

  const patternHasSteps = pattern
    ? visiblePads.some((pad) => (pattern.steps[pad.id] ?? []).some((sampleId) => sampleId !== null))
    : false
  const sampleLabels = Object.fromEntries(Object.entries(state.samples).map(([id, sample]) => [id, sample.label]))

  const handleBounce = async () => {
    if (!pattern || bouncing) return
    setBouncing(true)
    try {
      const buffer = await renderPatternToBuffer(state, pattern.id)
      const peaks = computePeaks(buffer, WAVEFORM_BUCKETS)
      const sequenceTrace: SequenceTrace = {
        stepCount: pattern.stepCount,
        padIds: visiblePads.map((pad) => pad.id),
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

  const traceHidden = pattern.traceSource === 'hidden'

  /** A bank head's preset chip: the layer's style and take, or an invitation. */
  const layerLabel = (kind: Bank['kind']) => {
    const layer = state.groove?.layers[kind]
    const style = layer && styleById(layer.styleId)
    return style ? `${style.name} · ${layer.take + 1}` : '+ Style'
  }

  return (
    // The Styles dock sits in the same column as the sequencer it feeds.
    <div className="sequencer-column">
    <SongArranger onBounced={onBounced} arrangerOpen={songArrangeOpen} setArrangerOpen={setSongArrangeOpen} />
    <section
      className={pattern.stepCount <= 16 ? 'module sequencer sequencer-fits-desktop' : 'module sequencer'}
      aria-label="Sequencer"
    >
      <header className="module-head">
        <h2 className="module-title">Seq</h2>
        <span className="module-sub">
          {pattern.name}{editingSection ? ` · ${state.transport.isPlaying ? 'Looping' : 'Loop ready'} ${editingSection.name}` : ''}
        </span>
        {!songArrangeOpen && state.songSections.length > 0 && <button type="button" className="chip-btn" onClick={() => {
          setSongArrangeOpen(true)
          requestAnimationFrame(() => document.querySelector('.song-arranger')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
        }}>↑ Song</button>}
        <Stepper
          label="Steps"
          value={pattern.stepCount}
          unit="st"
          onDecrement={() => dispatch({ type: 'REMOVE_PATTERN_STEPS', patternId: pattern.id })}
          onIncrement={() => dispatch({ type: 'ADD_PATTERN_STEPS', patternId: pattern.id })}
          decrementDisabled={pattern.stepCount <= MIN_STEP_COUNT}
          incrementDisabled={pattern.stepCount >= MAX_STEP_COUNT}
          decrementTitle="Remove the last four steps"
          incrementTitle="Add four steps"
        />
        <div className="module-head-tools">
          <button
            type="button"
            className={stylesOpen ? 'icon-btn on' : 'icon-btn'}
            onClick={() => setStylesOpen((open) => !open)}
            aria-label="Styles"
            aria-expanded={stylesOpen}
            title="Styles — drop preset layers into the beat, or start a whole beat"
          >
            <SparkIcon />
          </button>
        </div>
      </header>

      <div className="toolbar" role="toolbar" aria-label="Sequence tools">
        <div className="toolbar-group">
          <button
            type="button"
            className={sequencerGateMode ? 'chip-btn on' : 'chip-btn'}
            onClick={() => setSequencerGateMode((enabled) => !enabled)}
            aria-pressed={sequencerGateMode}
            title="Gate — hold a step to hear it only while held"
          >
            Gate
          </button>
          <button
            type="button"
            className={previewOnClick ? 'chip-btn on' : 'chip-btn'}
            onClick={() => setPreviewOnClick((enabled) => !enabled)}
            aria-pressed={previewOnClick}
            title={previewOnClick ? 'Filling a step plays it once' : 'Filling a step stays silent'}
          >
            Preview
          </button>
        </div>
        <div className="toolbar-group">
          <button
            type="button"
            className="chip-btn"
            onClick={() => void handleBounce()}
            disabled={!patternHasSteps || bouncing}
            title={patternHasSteps ? 'Save this sequence as a sample' : 'Program a step first'}
          >
            <SaveIcon size={14} />
            {bouncing ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="chip-btn"
            onClick={() => setLoadPickerOpen(true)}
            title="Load a previously saved sequence into this pattern"
          >
            <OpenIcon size={14} />
            Load
          </button>
          <button
            type="button"
            className={traceHidden ? 'chip-btn on' : 'chip-btn'}
            onClick={() =>
              dispatch({ type: traceHidden ? 'RESTORE_PATTERN_TRACE' : 'CAPTURE_PATTERN_TRACE', patternId: pattern.id })
            }
            disabled={!traceHidden && !patternHasSteps}
            aria-pressed={traceHidden}
            title={traceHidden ? 'Bring the hidden sequence back' : 'Hide this sequence, keeping it as a visual guide'}
          >
            <EyeIcon size={14} closed={traceHidden} />
            {traceHidden ? 'Show' : 'Hide'}
          </button>
          {pattern.traceSteps && !traceHidden && (
            <button
              type="button"
              className="chip-btn"
              onClick={() => dispatch({ type: 'CLEAR_PATTERN_TRACE', patternId: pattern.id })}
              title="Remove the visual trace"
            >
              Clear trace
            </button>
          )}
          <button
            type="button"
            className="chip-btn danger"
            onClick={() => setConfirmClear(true)}
            disabled={!patternHasSteps}
            title={patternHasSteps ? 'Clear every step in this pattern' : 'Nothing programmed yet'}
          >
            <TrashIcon size={14} />
            Clear
          </button>
        </div>
      </div>

      {!patternHasSteps && (
        <div className="sequencer-empty">
          <span className="sequencer-empty-text">Blank canvas? Start from a style.</span>
          <button type="button" className="chip-btn on" onClick={() => setStylesOpen(true)}>
            <SparkIcon size={14} />
            Styles
          </button>
        </div>
      )}

      <div className="sequencer-scroll" onWheel={handleTimelineWheel}>
        <div className="sequencer-grid">
          <div className="sequencer-row sequencer-header-row" aria-hidden="true">
            <div className="sequencer-row-fixed" />
            {chunk(
              Array.from({ length: pattern.stepCount }, (_, i) => i),
              GROUP_SIZE,
            ).map((group, gi) => (
              <div className="step-group" key={gi}>
                <span className="step-group-number">{group[0]! + 1}</span>
              </div>
            ))}
          </div>
          {state.banks.map((bank) => {
            const bankPads = visibleBankPads(state, bank)
            if (bankPads.length === 0) return null
            const melodic = bank.kind !== 'drums'
            const used = (pad: Pad) => (pattern.steps[pad.id] ?? []).some((sampleId) => sampleId !== null)
            const expanded = expandedOverride[bank.id] ?? bank.id === state.activeBankId
            const ordered = melodic
              ? [...bankPads].sort((a, b) => (b.music?.midis[0] ?? 0) - (a.music?.midis[0] ?? 0))
              : bankPads
            const rows = expanded ? ordered : ordered.filter(used)
            return (
              <div className={`sequencer-bank bank-${bank.kind}`} key={bank.id}>
                <div className="sequencer-bank-head">
                  <span className="sequencer-bank-name">{BANK_NAMES[bank.kind]}</span>
                  <button
                    type="button"
                    className={stripOpen[bank.id] ? 'sequencer-bank-style open' : 'sequencer-bank-style'}
                    onClick={() => setStripOpen((current) => ({ ...current, [bank.id]: !current[bank.id] }))}
                    aria-expanded={!!stripOpen[bank.id]}
                    title="Pick this bank's preset layer"
                  >
                    {layerLabel(bank.kind)}
                  </button>
                  <button
                    type="button"
                    className="sequencer-bank-toggle"
                    onClick={() => setExpandedOverride((current) => ({ ...current, [bank.id]: !expanded }))}
                    aria-expanded={expanded}
                  >
                    {expanded ? 'Used rows only' : `Show all ${bankPads.length}`}
                  </button>
                </div>
                {stripOpen[bank.id] && <LayerStrip kind={bank.kind} />}
                {rows.map((pad) => {
                  const padIndex = bankPads.indexOf(pad)
                  return (
                <SequencerRow
                  key={pad.id}
                  pad={pad}
                  padIndex={padIndex}
                  bank={bank}
                  patternId={pattern.id}
                  steps={pattern.steps[pad.id] ?? new Array<string | null>(pattern.stepCount).fill(null)}
                  traceSteps={pattern.traceSteps?.[pad.id] ?? []}
                  sampleLabels={sampleLabels}
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
                  removeDisabled={bank.padIds.length <= MIN_PAD_COUNT}
                />
                  )
                })}
                {!melodic && expanded && bank.visibleCount < MAX_PAD_COUNT && (
                  <div className="sequencer-add-row-slot">
                    <div className="sequencer-row-fixed" />
                    <button
                      type="button"
                      className="sequencer-add-row"
                      onClick={() => dispatch({ type: 'SET_VISIBLE_PAD_COUNT', count: bank.visibleCount + 1, bankId: bank.id })}
                    >
                      <PlusIcon size={14} />
                      Add row
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

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
      {swappingPadId && <PadLibraryPicker padId={swappingPadId} onClose={() => setSwappingPadId(null)} />}
      {loadPickerOpen && <SequenceLoadPicker onClose={() => setLoadPickerOpen(false)} />}
      {removingPad && (
        <ConfirmDialog
          message={`Remove pad ${removingPadIndex + 1} from the sequencer? Its programmed steps go with it — its sample stays in the library, and every other row is unaffected.`}
          confirmLabel="Remove"
          onConfirm={() => {
            dispatch({ type: 'REMOVE_PAD', padId: removingPad.id })
            setRemovingPadId(null)
          }}
          onCancel={() => setRemovingPadId(null)}
        />
      )}
    </section>
    {stylesOpen && (
      <StyleDock
        onClose={() => setStylesOpen(false)}
        // A fresh beat reads best folded to the rows it uses (a kit has up to 32).
        onStarted={() => setExpandedOverride(Object.fromEntries(state.banks.map((bank) => [bank.id, false])))}
      />
    )}
    </div>
  )
}

interface SequencerRowProps {
  pad: Pad
  padIndex: number
  bank: Bank
  patternId: string
  steps: Array<string | null>
  traceSteps: Array<string | null>
  sampleLabels: Record<string, string>
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
  bank,
  steps,
  traceSteps,
  sampleLabels,
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
  const { state } = useAppState()
  const looping = usePadLooping(engine, pad.id)
  const label = pad.music ? padLabel(pad.music, state.key, state.padLabels) : null
  const rowName = label ? `${BANK_NAMES[bank.kind]} ${label.name}` : `Pad ${padIndex + 1}`
  const gateSources = useRef(new Map<number, Voice>())
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
        {label ? (
          <span className="sequencer-row-remove" aria-hidden="true" />
        ) : (
          <button
            type="button"
            className="sequencer-row-remove"
            onClick={onRemove}
            disabled={removeDisabled}
            aria-label={`Remove pad ${padIndex + 1} from the sequencer`}
            title={removeDisabled ? 'At least one pad must remain' : 'Remove this row'}
          >
            <CloseIcon size={12} />
          </button>
        )}
        <button
          type="button"
          className={label ? 'sequencer-row-label named' : 'sequencer-row-label'}
          data-glow-pad={pad.id}
          onClick={label ? () => sample && !pad.muted && engine.triggerPad(pad, sample.buffer) : onSwapSound}
          aria-label={label ? `${rowName} — play` : `Pad ${padIndex + 1}${sample ? `: ${sample.label}` : ', empty'} — swap sound`}
          title={label ? `${label.name} — tap to hear it` : sample ? `${sample.label} — tap to swap` : 'Empty — tap to load a sound'}
        >
          <span className="row-glow" aria-hidden="true" />
          <span className="readout">{label ? label.name : String(padIndex + 1).padStart(2, '0')}</span>
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
                ]
                  .filter(Boolean)
                  .join(' ')}
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
                aria-label={sampleLabel ? `step ${stepIndex + 1} for ${rowName}: ${sampleLabel}` : traceLabel ? `Trace at step ${stepIndex + 1} for ${rowName}: ${traceLabel}` : `step ${stepIndex + 1} for ${rowName}`}
                title={sampleLabel ? `Step ${stepIndex + 1}: ${sampleLabel}` : traceLabel ? `Trace: ${traceLabel}` : `Step ${stepIndex + 1}`}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
