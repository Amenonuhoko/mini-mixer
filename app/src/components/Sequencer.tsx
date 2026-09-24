import { useEffect, useRef, useState } from 'react'
import { usePadLooping } from '../hooks/usePadLooping'
import { renderPatternToBuffer } from '../engine/bouncePattern'
import { styleById } from '../styles/library'
import { BANK_NAMES, playablePads, visibleBankPads } from '../state/banks'
import { MAX_PAD_COUNT, MIN_PAD_COUNT, MAX_STEP_COUNT, MIN_STEP_COUNT } from '../state/constants'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { useNavigation } from '../state/NavigationContext'
import { padIdentity } from '../utils/padIdentity'
import { computePeaks } from '../utils/waveform'
import type { AudioEngine, Voice } from '../engine/AudioEngine'
import type { Bank, Pad, Sample, SequenceTrace } from '../state/types'
import { ConfirmDialog } from './ConfirmDialog'
import { BrushIcon, EyeIcon, MoreIcon, OpenIcon, PlusIcon, SaveIcon, SparkIcon, SwapIcon, TrashIcon } from './icons'
import { Overlay } from './Overlay'
import { LayerStrip } from './LayerStrip'
import { StyleDock } from './StyleBrowser'
import { PadLibraryPicker } from './PadLibraryPicker'
import { SequenceLoadPicker } from './SequenceLoadPicker'
import type { PendingRecording } from './RecordingReview'
import { Stepper } from './Stepper'
import { SongArranger } from './SongArranger'

const GROUP_SIZE = 4
/** Painting near the scroll area's edge scrolls it: how close (px), and how fast (px per frame). */
const PAINT_EDGE_PX = 28
const PAINT_SCROLL_PX = 9

interface PaintCell {
  key: string
  padId: string
  step: number
  on: boolean
}

/** A drag across step cells: draws, or erases if it started on a lit cell. */
interface Painting {
  mode: 'draw' | 'erase'
  origin: PaintCell
  applied: Set<string>
  painted: boolean
  x: number
  y: number
  frame: number
}
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
  const [deletingBankId, setDeletingBankId] = useState<string | null>(null)
  const [sequencerGateMode, setSequencerGateMode] = useState(false)
  const [previewOnClick, setPreviewOnClick] = useState(true)
  const [removingPadId, setRemovingPadId] = useState<string | null>(null)
  const [loadPickerOpen, setLoadPickerOpen] = useState(false)
  const [stylesOpen, setStylesOpen] = useState(false)
  const [stripOpen, setStripOpen] = useState<Record<string, boolean>>({})
  const [songArrangeOpen, setSongArrangeOpen] = useState(state.transport.playMode === 'song')
  const [paintMode, setPaintMode] = useState(false)
  const [menuPadId, setMenuPadId] = useState<string | null>(null)
  const [confirmRepeat, setConfirmRepeat] = useState(false)
  const { selectedPadId, selectPad } = useNavigation()
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const paintRef = useRef<Painting | null>(null)
  const padsById = new Map(state.pads.map((pad) => [pad.id, pad]))

  // Arriving from the Pads page: bring the selected pad's row into view.
  useEffect(() => {
    if (!selectedPadId) return
    document.querySelector(`[data-row-pad="${CSS.escape(selectedPadId)}"]`)?.scrollIntoView({ block: 'center' })
    // Only on arrival — scrolling on every selection would yank the page while you play.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const removingPad = removingPadId ? state.pads.find((pad) => pad.id === removingPadId) : undefined
  const deletingBank = deletingBankId ? state.banks.find((bank) => bank.id === deletingBankId) : undefined
  const removingPadIndex = removingPad ? visiblePads.indexOf(removingPad) : -1
  const editingSection = state.transport.auditionScope === 'loop'
    ? state.songSections.find((section) => section.id === state.transport.auditionSectionId)
    : undefined
  const targetSection = (editingSection?.patternId === state.activePatternId ? editingSection : undefined)
    ?? state.songSections.find((section) => section.patternId === state.activePatternId)

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

  /** Tapping a row's name: hear it, select that pad (the Pads page follows), without reshuffling the rows. */
  const pickRow = (bank: Bank, pad: Pad) => {
    selectPad(pad.id)
    if (bank.id !== state.activeBankId) {
      // Keep every bank folded or open exactly as it is now.
      setExpandedOverride((current) =>
        Object.fromEntries(state.banks.map((item) => [item.id, current[item.id] ?? item.id === state.activeBankId])),
      )
      dispatch({ type: 'SET_ACTIVE_BANK', bankId: bank.id })
    }
    const sample = pad.sampleId ? state.samples[pad.sampleId] : undefined
    if (sample && !pad.muted) engine.triggerPad(pad, sample.buffer)
  }

  // --- Painting ------------------------------------------------------------
  // A drag along a row fills (or, starting on a lit cell, erases) every cell
  // it crosses, scrolling the grid when it nears an edge. With a
  // mouse that's always on; on touch it's the Paint tool, since a finger drag
  // otherwise scrolls.
  const toCell = (el: HTMLElement): PaintCell | null => {
    const padId = el.dataset.padId
    if (!padId) return null
    const step = Number(el.dataset.stepIndex)
    return { key: `${padId}:${step}`, padId, step, on: el.classList.contains('on') }
  }

  const cellAt = (x: number, y: number): PaintCell | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-step-index]')
    return el && gridRef.current?.contains(el) ? toCell(el) : null
  }

  /**
   * The step under `x` in the stroke's own row. A stroke stays in the row it
   * started in: a finger drifting up or down can't spill onto a neighbour, and
   * the grid shifting mid-stroke (the empty-pattern hint vanishing on the
   * first step) can't move it onto another row.
   */
  const strokeCellAt = (paint: Painting, x: number): PaintCell | null => {
    const row = gridRef.current?.querySelector(`[data-row-pad="${paint.origin.padId}"]`)
    if (!row) return null
    for (const el of row.querySelectorAll<HTMLElement>('[data-step-index]')) {
      const box = el.getBoundingClientRect()
      if (x >= box.left && x < box.right) return toCell(el)
    }
    return null
  }

  const paintCell = (cell: PaintCell) => {
    const paint = paintRef.current
    if (!paint || !pattern || paint.applied.has(cell.key)) return
    paint.applied.add(cell.key)
    paint.painted = true
    const pad = padsById.get(cell.padId)
    if (!pad) return
    if (paint.mode === 'erase') {
      if (cell.on) dispatch({ type: 'CLEAR_STEP', patternId: pattern.id, padId: pad.id, stepIndex: cell.step })
      return
    }
    if (cell.on || !pad.sampleId) return
    dispatch({ type: 'SET_STEP_SAMPLE', patternId: pattern.id, padId: pad.id, stepIndex: cell.step, sampleId: pad.sampleId })
    // Hear the first cell of a stroke, so you know what you're painting with.
    const sample = state.samples[pad.sampleId]
    if (paint.applied.size === 1 && previewOnClick && sample && !pad.muted) engine.triggerPad(pad, sample.buffer)
  }

  const autoScroll = () => {
    const paint = paintRef.current
    const scroller = scrollRef.current
    if (!paint || !scroller) return
    const box = scroller.getBoundingClientRect()
    const fixed = scroller.querySelector('.sequencer-row-fixed')?.getBoundingClientRect().width ?? 0
    const delta = paint.x < box.left + fixed + PAINT_EDGE_PX ? -PAINT_SCROLL_PX : paint.x > box.right - PAINT_EDGE_PX ? PAINT_SCROLL_PX : 0
    if (delta !== 0) {
      scroller.scrollLeft += delta
      const cell = paint.painted ? strokeCellAt(paint, paint.x) : null
      if (cell) paintCell(cell)
    }
    paint.frame = requestAnimationFrame(autoScroll)
  }

  const handleGridPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (sequencerGateMode || event.button > 0) return
    const cell = cellAt(event.clientX, event.clientY)
    if (!cell) return
    if (event.pointerType !== 'mouse' && !paintMode) return
    const paint: Painting = { mode: cell.on ? 'erase' : 'draw', origin: cell, applied: new Set(), painted: false, x: event.clientX, y: event.clientY, frame: 0 }
    paintRef.current = paint
    // Paint mode strokes from the first touch. A mouse press is left alone
    // until it drags, so a plain click still reaches the step and toggles it.
    if (paintMode) startStroke(paint, event.pointerId)
  }

  const startStroke = (paint: Painting, pointerId: number) => {
    gridRef.current?.setPointerCapture(pointerId)
    paintCell(paint.origin)
    paint.frame = requestAnimationFrame(autoScroll)
  }

  const handleGridPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const paint = paintRef.current
    if (!paint) return
    // A mouse released outside the grid before it dragged never sent us its pointerup.
    if (event.buttons === 0) return handleGridPointerEnd()
    paint.x = event.clientX
    paint.y = event.clientY
    const cell = strokeCellAt(paint, event.clientX)
    if (!cell || (cell.key === paint.origin.key && !paint.painted)) return
    // A mouse drag starts painting once it leaves the first cell.
    if (!paint.painted) startStroke(paint, event.pointerId)
    paintCell(cell)
  }

  const handleGridPointerEnd = () => {
    const paint = paintRef.current
    if (!paint) return
    cancelAnimationFrame(paint.frame)
    // The click that follows a stroke must not toggle its first cell back;
    // clear the stroke once that click (if any) has been handled.
    window.setTimeout(() => {
      if (paintRef.current === paint) paintRef.current = null
    }, 0)
  }

  const handleGridClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (paintRef.current?.painted) {
      event.stopPropagation()
      event.preventDefault()
    }
  }

  const laterBarsHaveSteps = pattern
    ? Object.values(pattern.steps).some((row) => row.some((cell, i) => i >= 16 && cell !== null))
    : false
  const repeatFirstBar = () => {
    if (pattern) dispatch({ type: 'REPEAT_FIRST_BAR', patternId: pattern.id })
    setConfirmRepeat(false)
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
        {state.songSections.length > 0 && (
          <label className="sequencer-part-select">
            Song part
            <select
              value={targetSection?.id ?? ''}
              onChange={(event) => {
                const section = state.songSections.find((item) => item.id === event.target.value)
                if (!section) return
                engine.setSequencerPlaybackEnabled(false)
                engine.stopAllSounds()
                dispatch({ type: 'SET_ACTIVE_PATTERN', patternId: section.patternId })
                dispatch({ type: 'AUDITION_SONG_SECTION', sectionId: section.id, scope: 'loop' })
              }}
              aria-label="Song part to edit in sequencer"
            >
              <option value="">Choose part</option>
              {state.songSections.map((section, index) => (
                <option key={section.id} value={section.id}>{index + 1}. {section.name}</option>
              ))}
            </select>
          </label>
        )}
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
          <button
            type="button"
            className={paintMode ? 'chip-btn on' : 'chip-btn'}
            onClick={() => setPaintMode((enabled) => !enabled)}
            aria-pressed={paintMode}
            title={paintMode ? 'Paint on — drag across steps to fill them (start on a lit step to erase)' : 'Paint — drag a finger across steps to fill them'}
          >
            <BrushIcon size={14} />
            Paint
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
          {pattern.stepCount > 16 && (
            <button
              type="button"
              className="chip-btn"
              onClick={() => (laterBarsHaveSteps ? setConfirmRepeat(true) : repeatFirstBar())}
              title="Copy the first bar onto every bar"
            >
              Bar 1 → all
            </button>
          )}
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

      <div className="sequencer-scroll" onWheel={handleTimelineWheel} ref={scrollRef}>
        <div
          className={paintMode ? 'sequencer-grid painting' : 'sequencer-grid'}
          ref={gridRef}
          onPointerDown={handleGridPointerDown}
          onPointerMove={handleGridPointerMove}
          onPointerUp={handleGridPointerEnd}
          onPointerCancel={handleGridPointerEnd}
          onClickCapture={handleGridClickCapture}
        >
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
            // A folded bank still shows the selected pad's row, so a pad picked on the Pads page is always here.
            const rows = expanded ? ordered : ordered.filter((pad) => used(pad) || pad.id === selectedPadId)
            const removedFromPart = targetSection?.excludedBanks?.includes(bank.kind) ?? false
            const bankHasSteps = bankPads.some(used)
            return (
              <div className={`sequencer-bank bank-${bank.kind}`} key={bank.id}>
                <div className="sequencer-bank-head">
                  <span className="sequencer-bank-name">{BANK_NAMES[bank.kind]}</span>
                  {targetSection && (
                    <button
                      type="button"
                      className={removedFromPart ? 'chip-btn on' : 'chip-btn danger'}
                      onClick={() => dispatch({
                        type: 'SET_SONG_SECTION_BANK_INCLUDED',
                        sectionId: targetSection.id,
                        bank: bank.kind,
                        included: removedFromPart,
                      })}
                      disabled={!removedFromPart && !bankHasSteps}
                      aria-label={`${removedFromPart ? 'Restore' : 'Remove'} ${BANK_NAMES[bank.kind]} ${removedFromPart ? 'to' : 'from'} ${targetSection.name} song part`}
                      title={removedFromPart ? 'Bring this group back into this song part' : 'Remove this group from this song part; its pattern steps stay saved'}
                    >
                      {removedFromPart ? `Restore in ${targetSection.name}` : `Remove from ${targetSection.name}`}
                    </button>
                  )}
                  <button
                    type="button"
                    className="chip-btn danger"
                    onClick={() => setDeletingBankId(bank.id)}
                    disabled={!bankHasSteps}
                    aria-label={`Delete ${BANK_NAMES[bank.kind]} steps from ${pattern.name} pattern`}
                    title="Permanently delete this group's steps from the pattern, including linked song parts"
                  >
                    Delete steps
                  </button>
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
                {removedFromPart && <p className="sequencer-bank-removed">Removed from {targetSection?.name}. Restore it to hear these steps again.</p>}
                {!removedFromPart && stripOpen[bank.id] && <LayerStrip kind={bank.kind} />}
                {!removedFromPart && rows.map((pad) => (
                <SequencerRow
                  key={pad.id}
                  pad={pad}
                  bank={bank}
                  steps={pattern.steps[pad.id] ?? new Array<string | null>(pattern.stepCount).fill(null)}
                  traceSteps={pattern.traceSteps?.[pad.id] ?? []}
                  sampleLabels={sampleLabels}
                  engine={engine}
                  sample={pad.sampleId ? state.samples[pad.sampleId] : undefined}
                  selected={pad.id === selectedPadId}
                  gateMode={sequencerGateMode}
                  previewOnClick={previewOnClick}
                  onToggleStep={(stepIndex) =>
                    dispatch({ type: 'TOGGLE_STEP', patternId: pattern.id, padId: pad.id, stepIndex, sampleId: pad.sampleId })
                  }
                  onPick={() => pickRow(bank, pad)}
                  onOpenMenu={() => setMenuPadId(pad.id)}
                />
                ))}
                {!removedFromPart && !melodic && expanded && bank.visibleCount < MAX_PAD_COUNT && (
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
      {deletingBank && (
        <ConfirmDialog
          message={`Delete all ${BANK_NAMES[deletingBank.kind]} steps from ${pattern.name}? Every song part using this pattern will lose them. This cannot be undone.`}
          confirmLabel="Delete steps"
          onConfirm={() => {
            dispatch({ type: 'CLEAR_BANK_PATTERN', patternId: pattern.id, bankId: deletingBank.id })
            setDeletingBankId(null)
          }}
          onCancel={() => setDeletingBankId(null)}
        />
      )}
      {menuPadId && (() => {
        const pad = padsById.get(menuPadId)
        const bank = state.banks.find((item) => item.padIds.includes(menuPadId))
        if (!pad || !bank) return null
        const close = () => setMenuPadId(null)
        return (
          <RowMenu
            pad={pad}
            bank={bank}
            stepCount={pattern.stepCount}
            onFill={(steps) => dispatch({ type: 'SET_ROW_STEPS', patternId: pattern.id, padId: pad.id, steps, sampleId: pad.sampleId })}
            onSwap={bank.kind === 'drums' ? () => { close(); setSwappingPadId(pad.id) } : null}
            onRemove={bank.kind === 'drums' && bank.padIds.length > MIN_PAD_COUNT ? () => { close(); setRemovingPadId(pad.id) } : null}
            onClose={close}
          />
        )
      })()}
      {confirmRepeat && (
        <ConfirmDialog
          message="Copy bar 1 onto every bar? The steps already in the later bars are replaced."
          confirmLabel="Copy"
          onConfirm={repeatFirstBar}
          onCancel={() => setConfirmRepeat(false)}
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
  bank: Bank
  steps: Array<string | null>
  traceSteps: Array<string | null>
  sampleLabels: Record<string, string>
  engine: AudioEngine
  sample: Sample | undefined
  selected: boolean
  gateMode: boolean
  previewOnClick: boolean
  onToggleStep: (stepIndex: number) => void
  /** Tapping the row's name: hear it, and make it the selected pad (on the Pads page too). */
  onPick: () => void
  onOpenMenu: () => void
}

/**
 * One pad's row: its name (number, kit glyph, sound — the same name the pad
 * grid shows), a row menu, and its steps. Painting across cells is handled
 * by the grid (see Sequencer), so it can cross rows and auto-scroll.
 */
function SequencerRow({
  pad,
  bank,
  steps,
  traceSteps,
  sampleLabels,
  engine,
  sample,
  selected,
  gateMode,
  previewOnClick,
  onToggleStep,
  onPick,
  onOpenMenu,
}: SequencerRowProps) {
  const { state } = useAppState()
  const looping = usePadLooping(engine, pad.id)
  const identity = padIdentity(state, bank, pad)
  const rowName = pad.music ? `${BANK_NAMES[bank.kind]} ${identity.name}` : `Pad ${identity.number}, ${identity.name}`
  const gateSources = useRef(new Map<number, Voice>())

  const stopGateSource = (pointerId: number) => {
    gateSources.current.get(pointerId)?.stop()
    gateSources.current.delete(pointerId)
  }

  const startGate = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!gateMode || !sample || pad.muted) return
    event.currentTarget.setPointerCapture(event.pointerId)
    gateSources.current.set(event.pointerId, engine.triggerPad(pad, sample.buffer))
  }

  const toggle = (event: React.MouseEvent<HTMLButtonElement>, on: boolean, stepIndex: number) => {
    onToggleStep(stepIndex)
    if (on || !sample || pad.muted || !previewOnClick) return
    // In Gate mode the note began on pointer-down and is stopped by release.
    // Keyboard activation has no pointer lifecycle, so give it a normal audition.
    if (!gateMode || event.detail === 0) engine.triggerPad(pad, sample.buffer)
  }

  return (
    <div className={['sequencer-row', looping ? 'row-looping' : '', selected ? 'selected' : ''].filter(Boolean).join(' ')} data-row-pad={pad.id}>
      <div className="sequencer-row-fixed">
        <button type="button" className="sequencer-row-menu" onClick={onOpenMenu} aria-label={`${rowName}: row options`} title="Fill, swap or remove this row">
          <MoreIcon size={14} />
        </button>
        <button
          type="button"
          className="sequencer-row-label"
          data-glow-pad={pad.id}
          onClick={onPick}
          aria-pressed={selected}
          aria-label={`${rowName}: play and select`}
          title={`${identity.name} — tap to hear it and select it`}
        >
          <span className="row-glow" aria-hidden="true" />
          {!pad.music && <span className="row-num readout">{identity.number}</span>}
          {identity.icon && <span className="row-icon" aria-hidden="true">{identity.icon}</span>}
          <span className="row-name">{identity.name}</span>
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
                data-pad-id={pad.id}
                className={['step', on ? 'on' : '', traced ? 'trace' : ''].filter(Boolean).join(' ')}
                onPointerDown={startGate}
                onPointerUp={(event) => stopGateSource(event.pointerId)}
                onPointerCancel={(event) => stopGateSource(event.pointerId)}
                onClick={(event) => toggle(event, on, stepIndex)}
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

/** One-tap row fills, across the whole pattern. */
const ROW_FILLS: Array<{ id: string; label: string; hits: (step: number) => boolean }> = [
  { id: 'beats', label: 'Every beat', hits: (i) => i % 4 === 0 },
  { id: 'eighths', label: 'Every 8th', hits: (i) => i % 2 === 0 },
  { id: 'sixteenths', label: 'Every 16th', hits: () => true },
  { id: 'offbeats', label: 'Offbeats', hits: (i) => i % 4 === 2 },
  { id: 'backbeat', label: 'Beats 2 & 4', hits: (i) => i % 16 === 4 || i % 16 === 12 },
  { id: 'clear', label: 'Clear row', hits: () => false },
]

interface RowMenuProps {
  pad: Pad
  bank: Bank
  stepCount: number
  onFill: (steps: number[]) => void
  onSwap: (() => void) | null
  onRemove: (() => void) | null
  onClose: () => void
}

/** A row's options: fill it in one tap (the fast way to program a lot on a phone), or swap / remove it. */
function RowMenu({ pad, bank, stepCount, onFill, onSwap, onRemove, onClose }: RowMenuProps) {
  const { state } = useAppState()
  const identity = padIdentity(state, bank, pad)
  const fill = (hits: (step: number) => boolean) => {
    onFill(Array.from({ length: stepCount }, (_, i) => i).filter(hits))
    onClose()
  }
  return (
    <Overlay
      onClose={onClose}
      title={`${identity.icon ? `${identity.icon} ` : ''}${identity.name}`}
      subtitle={pad.sampleId ? 'Fill the whole row in one tap — then tap single steps to tweak.' : 'This pad has no sound yet.'}
    >
      <section className="sheet-section" aria-label="Fill">
        <h3 className="label">Fill</h3>
        <div className="row-fills">
          {ROW_FILLS.map((option) => (
            <button key={option.id} type="button" className="row-fill" onClick={() => fill(option.hits)} disabled={!pad.sampleId && option.id !== 'clear'}>
              <span className="row-fill-name">{option.label}</span>
              <span className="style-preview-row" aria-hidden="true">
                {Array.from({ length: 16 }, (_, i) => (
                  <span key={i} className={option.hits(i) ? 'style-preview-cell on' : 'style-preview-cell'} />
                ))}
              </span>
            </button>
          ))}
        </div>
      </section>
      {(onSwap || onRemove) && (
        <section className="sheet-section" aria-label="Row">
          <div className="row-menu-actions">
            {onSwap && (
              <button type="button" className="btn" onClick={onSwap}>
                <SwapIcon size={16} />
                Swap sound
              </button>
            )}
            {onRemove && (
              <button type="button" className="btn btn-danger" onClick={onRemove}>
                <TrashIcon size={16} />
                Remove row
              </button>
            )}
          </div>
        </section>
      )}
    </Overlay>
  )
}
