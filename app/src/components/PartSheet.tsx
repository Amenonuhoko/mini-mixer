import { bankHasSteps } from '../hooks/useGroove'
import { useAppState } from '../state/AppStateContext'
import { BANK_NAMES, getBank } from '../state/banks'
import type { BankKind } from '../state/types'
import { styleById } from '../styles/library'
import { Overlay } from './Overlay'
import { PartControls } from './PartControls'

/**
 * One part's generated layer, from its bank header in Seq: its own style
 * (overriding Make a beat's), a new take, Busy (sparse ↔ busy), Keys / Kit
 * (the style's own keys or drums ↔ all of the bank's) and Clear. Make a beat
 * shows the same controls (PartControls), with the part's sound and phrasing.
 */
export function PartSheet({ kind, onClose }: { kind: BankKind; onClose: () => void }) {
  const { state } = useAppState()
  const layer = state.groove?.layers[kind]
  const live = !!layer && bankHasSteps(state, getBank(state, kind))

  return (
    <Overlay onClose={onClose} title={BANK_NAMES[kind]} subtitle={live && layer ? `${styleById(layer.styleId)?.name ?? ''} · take ${layer.take + 1}` : 'Pick a style to write this part'}>
      <section className="sheet-section">
        <PartControls kind={kind} onDone={onClose} />
      </section>
    </Overlay>
  )
}
