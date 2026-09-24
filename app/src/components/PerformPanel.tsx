import type { ReactNode } from 'react'
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

  return (
    <div className="perform-panel" role="group" aria-label="Perform">
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
