import { useAppState } from '../state/AppStateContext'
import { BANK_NAMES } from '../state/banks'

/**
 * Drums · Bass · Chords · Melody — each layer of a beat has its own bank of
 * pads, so "what should I play?" starts with a role instead of a blank grid.
 * A dot marks banks that already have sounds.
 */
export function BankTabs() {
  const { state, dispatch } = useAppState()
  return (
    <div className="segmented segmented-sm bank-tabs" role="tablist" aria-label="Pad banks">
      {state.banks.map((bank) => {
        const active = bank.id === state.activeBankId
        const padIds = new Set(bank.padIds.slice(0, bank.visibleCount))
        const filled = state.pads.some((pad) => padIds.has(pad.id) && pad.sampleId !== null)
        return (
          <button
            key={bank.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? 'segment on' : 'segment'}
            onClick={() => dispatch({ type: 'SET_ACTIVE_BANK', bankId: bank.id })}
          >
            {BANK_NAMES[bank.kind]}
            {filled && <span className="bank-dot" aria-hidden="true" />}
          </button>
        )
      })}
    </div>
  )
}
