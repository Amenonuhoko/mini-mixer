import { useAppState } from '../state/AppStateContext'
import type { Bank, Pad } from '../state/types'
import { padIdentity } from '../utils/padIdentity'
import { Overlay } from './Overlay'

/** One-tap row fills, across the whole pattern. */
const ROW_FILLS: Array<{ id: string; label: string; hits: (step: number) => boolean }> = [
  { id: 'beats', label: 'Every beat', hits: (i) => i % 4 === 0 },
  { id: 'eighths', label: 'Every 8th', hits: (i) => i % 2 === 0 },
  { id: 'sixteenths', label: 'Every 16th', hits: () => true },
  { id: 'offbeats', label: 'Offbeats', hits: (i) => i % 4 === 2 },
  { id: 'backbeat', label: 'Beats 2 & 4', hits: (i) => i % 16 === 4 || i % 16 === 12 },
  { id: 'clear', label: 'Clear row', hits: () => false },
]

interface StepsMenuProps {
  pad: Pad
  bank: Bank
  stepCount: number
  onFill: (steps: number[]) => void
  onClose: () => void
}

/** Fill a pad's row in one tap — the fast way to program a lot on a phone — then tweak single steps. */
export function StepsMenu({ pad, bank, stepCount, onFill, onClose }: StepsMenuProps) {
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
    </Overlay>
  )
}
