import { MAX_NOTE_FADE_STEPS, type NoteEditChange } from '../engine/phrasing'
import { MAX_STEP_COUNT } from '../state/constants'
import { useAppState } from '../state/AppStateContext'
import type { NoteRef } from '../state/reducer'
import type { Pattern } from '../state/types'
import { MixedStepper } from './MixedStepper'

interface NoteEditBarProps {
  pattern: Pattern
  /** The selected notes — lit steps only. */
  notes: NoteRef[]
  onSelectRow: (() => void) | null
  onSelectAll: () => void
  onDeselect: () => void
}

const LENGTH_CHOICES = [0, 1, 2, 4, 8, 16]
const steps = (count: number) => (count === 1 ? 'step' : 'steps')

/**
 * Seq's Select tool: what to do with the notes (lit steps) you have picked.
 * Fade in and out, how long a note is held, and whether its sound stretches to
 * fill that length. Every control writes straight to all selected notes and is
 * heard the next time the pattern plays; where they differ it says "Mixed".
 */
export function NoteEditBar({ pattern, notes, onSelectRow, onSelectAll, onDeselect }: NoteEditBarProps) {
  const { dispatch } = useAppState()
  const edits = notes.map(({ padId, stepIndex }) => pattern.noteEdits?.[padId]?.[String(stepIndex)])
  const set = (edit: NoteEditChange) =>
    dispatch({ type: 'SET_NOTE_EDITS', patternId: pattern.id, notes, edit })
  const lengths = edits.map((edit) => edit?.lengthSteps ?? 0)
  const withLength = edits.filter((edit) => edit?.lengthSteps)
  const allStretched = withLength.length > 0 && withLength.every((edit) => edit?.stretch)
  const longest = Math.min(MAX_STEP_COUNT, Math.max(1, ...notes.map(({ stepIndex }) => pattern.stepCount - stepIndex)))

  return (
    <div className="note-edit" role="group" aria-label="Edit the selected notes">
      <div className="note-edit-head">
        <strong>{notes.length === 0 ? 'Select notes' : notes.length === 1 ? '1 note selected' : `${notes.length} notes selected`}</strong>
        <div className="note-edit-select">
          <button type="button" className="chip-btn" onClick={onSelectRow ?? undefined} disabled={!onSelectRow} title="Every note in the row picked by its name">
            This row
          </button>
          <button type="button" className="chip-btn" onClick={onSelectAll} title="Every note in the pattern">
            All notes
          </button>
          <button type="button" className="chip-btn" onClick={onDeselect} disabled={notes.length === 0}>
            Deselect
          </button>
        </div>
      </div>
      {notes.length === 0 ? (
        <p className="muted sheet-note">Tap lit steps, or drag across them, to pick the notes to edit.</p>
      ) : (
        <>
          <div className="note-edit-fields">
            <div className="note-edit-field">
              <span className="label">Fade in</span>
              <MixedStepper
                label="Fade in"
                values={edits.map((edit) => edit?.fadeInSteps ?? 0)}
                max={MAX_NOTE_FADE_STEPS}
                zeroLabel="Off"
                unit={steps}
                decrementTitle="Fade in: one step shorter"
                incrementTitle="Fade in: one step longer"
                onSet={(count) => set({ fadeInSteps: count })}
              />
            </div>
            <div className="note-edit-field">
              <span className="label">Fade out</span>
              <MixedStepper
                label="Fade out"
                values={edits.map((edit) => edit?.fadeOutSteps ?? 0)}
                max={MAX_NOTE_FADE_STEPS}
                zeroLabel="Off"
                unit={steps}
                decrementTitle="Fade out: one step shorter"
                incrementTitle="Fade out: one step longer"
                onSet={(count) => set({ fadeOutSteps: count })}
              />
            </div>
            <div className="note-edit-field">
              <span className="label" title="How long the note is held. Auto follows the sound.">Length</span>
              <MixedStepper
                label="Length"
                values={lengths}
                max={longest}
                zeroLabel="Auto"
                unit={steps}
                decrementTitle="Length: one step shorter"
                incrementTitle="Length: one step longer"
                onSet={(count) => set({ lengthSteps: count })}
              />
            </div>
            <div className="note-edit-field">
              <span className="label" title="Slows or speeds the sound to last exactly the length — its pitch follows, like a tape.">Stretch to fill</span>
              <button
                type="button"
                className={allStretched ? 'chip-btn on' : 'chip-btn'}
                aria-pressed={allStretched}
                disabled={withLength.length === 0}
                title={withLength.length === 0 ? 'Give the notes a length first' : 'Slows or speeds the sound to last exactly the length — its pitch follows, like a tape.'}
                onClick={() => set({ stretch: !allStretched })}
              >
                {allStretched ? 'On' : withLength.some((edit) => edit?.stretch) ? 'Mixed' : 'Off'}
              </button>
            </div>
          </div>
          <div className="note-edit-lengths" role="group" aria-label="Length shortcuts">
            {LENGTH_CHOICES.map((count) => (
              <button
                key={count}
                type="button"
                className={lengths.every((length) => length === count) ? 'chip-btn on' : 'chip-btn'}
                aria-pressed={lengths.every((length) => length === count)}
                disabled={count > longest}
                onClick={() => set({ lengthSteps: count })}
              >
                {count === 0 ? 'Auto' : count}
              </button>
            ))}
            <button
              type="button"
              className="chip-btn note-edit-reset"
              disabled={edits.every((edit) => !edit)}
              onClick={() => dispatch({ type: 'CLEAR_NOTE_EDITS', patternId: pattern.id, notes })}
            >
              Reset
            </button>
          </div>
        </>
      )}
    </div>
  )
}
