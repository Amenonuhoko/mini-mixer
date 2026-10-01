import { useState, type ReactNode } from 'react'
import { useAppState } from '../state/AppStateContext'
import type { ArpPattern, PerformMode, PerformRate, PerformSettings, StrumDirection, StrumSpeed } from '../state/types'

const MODES: Array<{ id: PerformMode; label: string; hint: string }> = [
  { id: 'off', label: 'Off', hint: 'Holding a pad plays it once' },
  { id: 'repeat', label: 'Repeat', hint: 'Holding a pad retriggers it in time' },
  { id: 'arp', label: 'Arp', hint: 'Holding pads plays their notes one at a time' },
]
const RATES: PerformRate[] = ['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32']
const PATTERNS: Array<{ id: ArpPattern; label: string }> = [
  { id: 'up', label: 'Up' },
  { id: 'down', label: 'Down' },
  { id: 'upDown', label: 'Up·Dn' },
  { id: 'random', label: 'Rand' },
]
const STRUMS: Array<{ id: StrumDirection; label: string }> = [
  { id: 'off', label: 'Off' },
  { id: 'up', label: 'Up' },
  { id: 'down', label: 'Down' },
]
const STRUM_SPEEDS: Array<{ id: StrumSpeed; label: string }> = [
  { id: 'fast', label: 'Fast' },
  { id: 'medium', label: 'Med' },
  { id: 'slow', label: 'Slow' },
]

/**
 * How held pads perform — inline in the pad module rather than a sheet, so
 * it can be changed mid-performance without covering the pads. Hold: Off,
 * note Repeat (any pad, drums included), or Arp (a chord pad's notes, or
 * several held note pads, one at a time; Latch keeps it going hands-free).
 * Strum rolls a chord pad's notes instead of hitting them together.
 * Everything performed here is captured by step record.
 */
export function PerformPanel() {
  const { state, dispatch } = useAppState()
  const perform = state.perform
  const set = (change: Partial<PerformSettings>) => dispatch({ type: 'SET_PERFORM', perform: change })

  const [lesson, setLesson] = useState<number | null>(null)
  const [showHelp, setShowHelp] = useState(true)

  return (
    <div className="perform-panel" role="group" aria-label="Perform">
      <div className="perform-head">
        <span className="perform-title">Perform</span>
        <button
          type="button"
          className={showHelp ? 'chip-btn on' : 'chip-btn'}
          aria-pressed={showHelp}
          onClick={() => setShowHelp((open) => !open)}
        >
          How to
        </button>
        <button
          type="button"
          className={lesson !== null ? 'chip-btn on' : 'chip-btn'}
          aria-pressed={lesson !== null}
          onClick={() => setLesson((current) => (current === null ? 0 : null))}
        >
          {lesson !== null ? 'End lesson' : 'Teach me'}
        </button>
      </div>
      {lesson !== null && <Lesson step={lesson} onStep={setLesson} apply={set} />}
      {lesson === null && showHelp && <p className="perform-help">{helpFor(perform)}</p>}
      <Row label="Hold">
        <Segments options={MODES} value={perform.mode} onChange={(mode) => set({ mode })} label="Hold behavior" />
      </Row>
      {perform.mode !== 'off' && (
        <Row label="Rate">
          <Segments
            options={RATES.map((rate) => ({ id: rate, label: rate }))}
            value={perform.rate}
            onChange={(rate) => set({ rate })}
            label="Rate"
          />
        </Row>
      )}
      {perform.mode === 'arp' && (
        <Row label="Arp">
          <Segments options={PATTERNS} value={perform.arpPattern} onChange={(arpPattern) => set({ arpPattern })} label="Arp pattern" />
          <Segments
            options={[
              { id: 1 as const, label: '1 oct' },
              { id: 2 as const, label: '2 oct' },
            ]}
            value={perform.arpOctaves}
            onChange={(arpOctaves) => set({ arpOctaves })}
            label="Octaves"
          />
          <button
            type="button"
            className={perform.latch ? 'chip-btn on' : 'chip-btn'}
            aria-pressed={perform.latch}
            onClick={() => set({ latch: !perform.latch })}
            title="Keep the arpeggio going after you let go — a fresh press replaces it"
          >
            Latch
          </button>
        </Row>
      )}
      <Row label="Strum">
        <Segments options={STRUMS} value={perform.strum} onChange={(strum) => set({ strum })} label="Strum direction" />
        {perform.strum !== 'off' && (
          <Segments options={STRUM_SPEEDS} value={perform.strumSpeed} onChange={(strumSpeed) => set({ strumSpeed })} label="Strum speed" />
        )}
      </Row>
    </div>
  )
}

/** Plain-language tip for whatever is set right now. */
function helpFor(perform: PerformSettings): string {
  const strum =
    perform.strum !== 'off'
      ? ` Strum is on: chord pads roll their notes ${perform.strum === 'up' ? 'low to high' : 'high to low'} instead of hitting at once.`
      : ''
  if (perform.mode === 'repeat')
    return `Press and hold any pad — it retriggers every ${perform.rate} note in time with the tempo. Let go to stop. Try hi-hats at 1/16, then switch rates mid-hold for rolls.${strum}`
  if (perform.mode === 'arp')
    return `Hold a chord pad (or several note pads) — the notes play one at a time, ${perform.arpPattern === 'upDown' ? 'up then down' : perform.arpPattern}, every ${perform.rate}.${perform.latch ? ' Latch is on: it keeps going after you let go; press new pads to change the chord.' : ' Turn on Latch to keep it running hands-free.'}${strum}`
  return `Hold is Off — each tap plays a pad once. Pick Repeat for drum rolls or Arp for melodies from chords. Arm step record (●) while the sequence plays to write what you perform.${strum}`
}

interface LessonStep {
  title: string
  text: string
  settings?: Partial<PerformSettings>
}

const LESSON: LessonStep[] = [
  {
    title: 'Feel the pulse',
    text: 'Start the transport so you hear the beat. With Hold Off, tap a kick pad on every beat: 1, 2, 3, 4. Stay with the click.',
    settings: { mode: 'off', strum: 'off' },
  },
  {
    title: 'Note repeat',
    text: 'Repeat is now on at 1/8. Press and hold a hi-hat pad for one bar, then release. The app keeps it in time — you just choose when.',
    settings: { mode: 'repeat', rate: '1/8' },
  },
  {
    title: 'Build a roll',
    text: 'Hold a snare and change Rate from 1/8 → 1/16 → 1/32 over the last bar before a drop. Release right on beat 1.',
    settings: { mode: 'repeat', rate: '1/16' },
  },
  {
    title: 'Arpeggio',
    text: 'Arp is on, pattern Up. Hold a chord pad: its notes play one by one. Try Up·Dn and 2 oct for a wider line.',
    settings: { mode: 'arp', rate: '1/16', arpPattern: 'up', arpOctaves: 1, latch: false },
  },
  {
    title: 'Latch it',
    text: 'Latch is on — tap a chord pad and let go; the arp keeps playing. Your hands are free: tap drum pads over it. Tap another chord to change.',
    settings: { mode: 'arp', latch: true },
  },
  {
    title: 'Strum',
    text: 'Hold is Off and Strum is Down. Tap chord pads like a guitar: Slow for ballads, Fast for funk. Alternate Down and Up for a rhythm.',
    settings: { mode: 'off', strum: 'down', strumSpeed: 'medium', latch: false },
  },
  {
    title: 'Record it',
    text: 'Arm step record (●) next to Perform, start the sequence and play — every repeat, arp note and strum is written into the step it lands on. You’re performing!',
  },
]

function Lesson({
  step,
  onStep,
  apply,
}: {
  step: number
  onStep: (step: number | null) => void
  apply: (change: Partial<PerformSettings>) => void
}) {
  const current = LESSON[step]
  const go = (next: number) => {
    const target = LESSON[next]
    if (target.settings) apply(target.settings)
    onStep(next)
  }
  return (
    <div className="perform-lesson" aria-live="polite">
      <div className="perform-lesson-head">
        <span className="perform-lesson-count">
          {step + 1}/{LESSON.length}
        </span>
        <strong>{current.title}</strong>
      </div>
      <p className="perform-help">{current.text}</p>
      <div className="perform-lesson-nav">
        <button type="button" className="chip-btn" disabled={step === 0} onClick={() => go(step - 1)}>
          Back
        </button>
        {current.settings && (
          <button type="button" className="chip-btn" onClick={() => apply(current.settings!)}>
            Set it up
          </button>
        )}
        {step < LESSON.length - 1 ? (
          <button type="button" className="chip-btn on" onClick={() => go(step + 1)}>
            Next
          </button>
        ) : (
          <button type="button" className="chip-btn on" onClick={() => onStep(null)}>
            Done
          </button>
        )}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="perform-row">
      <span className="perform-row-label">{label}</span>
      <div className="perform-row-controls">{children}</div>
    </div>
  )
}

interface SegmentsProps<T extends string | number> {
  options: Array<{ id: T; label: string; hint?: string }>
  value: T
  onChange: (value: T) => void
  label: string
}

function Segments<T extends string | number>({ options, value, onChange, label }: SegmentsProps<T>) {
  return (
    <div className="segmented segmented-sm" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className={value === option.id ? 'segment on' : 'segment'}
          onClick={() => onChange(option.id)}
          title={option.hint}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
