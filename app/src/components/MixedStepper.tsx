import { Stepper } from './Stepper'

interface MixedStepperProps {
  label: string
  /** One value per selected item; they may differ. */
  values: number[]
  max: number
  /** What a value of 0 reads as ("Off", "Auto"). */
  zeroLabel: string
  /** The unit after a non-zero value ("bar" / "bars"). */
  unit: (value: number) => string
  decrementTitle: string
  incrementTitle: string
  onSet: (value: number) => void
}

/**
 * A Stepper for a setting held by several selected things at once (song
 * sections, notes). Where they differ it reads "Mixed", and the first tap
 * makes them all the same — the highest going up, the lowest going down —
 * before it steps by one.
 */
export function MixedStepper({ label, values, max, zeroLabel, unit, decrementTitle, incrementTitle, onSet }: MixedStepperProps) {
  const low = Math.min(...values)
  const high = Math.max(...values)
  const same = low === high
  return (
    <Stepper
      label={label}
      value={!same ? 'Mixed' : low === 0 ? zeroLabel : low}
      {...(same && low > 0 ? { unit: unit(low) } : {})}
      onDecrement={() => onSet(same ? low - 1 : low)}
      onIncrement={() => onSet(same ? high + 1 : high)}
      decrementDisabled={same && low <= 0}
      incrementDisabled={same && high >= max}
      decrementTitle={decrementTitle}
      incrementTitle={incrementTitle}
    />
  )
}
