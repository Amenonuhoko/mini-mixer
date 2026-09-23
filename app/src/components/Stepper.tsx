import type { ReactNode } from 'react'
import { MinusIcon, PlusIcon } from './icons'

interface StepperProps {
  value: ReactNode
  /** Short caption shown beside the value (e.g. "pads", "steps"). */
  unit?: string
  label: string
  onDecrement: () => void
  onIncrement: () => void
  decrementDisabled?: boolean
  incrementDisabled?: boolean
  decrementTitle?: string
  incrementTitle?: string
}

/** The one discrete −/value/+ control — used anywhere a count is nudged (pads, steps) so it always looks and behaves the same. */
export function Stepper({
  value,
  unit,
  label,
  onDecrement,
  onIncrement,
  decrementDisabled = false,
  incrementDisabled = false,
  decrementTitle,
  incrementTitle,
}: StepperProps) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="stepper-btn"
        onClick={onDecrement}
        disabled={decrementDisabled}
        aria-label={decrementTitle ?? `Fewer ${label.toLowerCase()}`}
        title={decrementTitle}
      >
        <MinusIcon size={14} />
      </button>
      <span className="stepper-value">
        <span className="readout">{value}</span>
        {unit && <span className="stepper-unit">{unit}</span>}
      </span>
      <button
        type="button"
        className="stepper-btn"
        onClick={onIncrement}
        disabled={incrementDisabled}
        aria-label={incrementTitle ?? `More ${label.toLowerCase()}`}
        title={incrementTitle}
      >
        <PlusIcon size={14} />
      </button>
    </div>
  )
}
