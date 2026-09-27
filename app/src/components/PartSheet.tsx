import { bankHasSteps, useGroove } from '../hooks/useGroove'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { BANK_NAMES, getBank } from '../state/banks'
import type { BankKind } from '../state/types'
import { STYLES, styleById } from '../styles/library'
import { CloseIcon, DiceIcon } from './icons'
import { Overlay } from './Overlay'

/**
 * One part's generated layer, from its bank header in Seq: its own style
 * (overriding Make a beat's), a new take, Busy (sparse ↔ busy), Keys / Kit
 * (the style's own keys or drums ↔ all of the bank's) and Clear.
 */
export function PartSheet({ kind, onClose }: { kind: BankKind; onClose: () => void }) {
  const { state } = useAppState()
  const engine = useEngine()
  const { busy, setLayerStyle, newTake, setIntensity, setRange, clearLayer } = useGroove()
  const layer = state.groove?.layers[kind]
  const live = !!layer && bankHasSteps(state, getBank(state, kind))
  const intensity = Math.round((layer?.intensity ?? 0.5) * 100)
  const range = Math.round((layer?.range ?? 0) * 100)
  const name = BANK_NAMES[kind]

  return (
    <Overlay onClose={onClose} title={name} subtitle={live && layer ? `${styleById(layer.styleId)?.name ?? ''} · take ${layer.take + 1}` : 'Pick a style to write this part'}>
      <section className="sheet-section part-sheet">
        <div className="part-sheet-style">
          <select
            value={live && layer ? layer.styleId : ''}
            onChange={(event) => { const style = styleById(event.target.value); if (style) { engine.getContext(); void setLayerStyle(kind, style) } }}
            disabled={busy !== null}
            aria-label={`${name} style`}
          >
            <option value="" disabled>{busy?.startsWith(`${kind}:`) ? 'Building…' : 'Style…'}</option>
            {STYLES.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
          <button type="button" className="btn" onClick={() => newTake(kind)} disabled={!live || busy !== null} aria-label={`New take of the ${name} layer`}>
            <DiceIcon size={14} /> New take
          </button>
        </div>
        <label className="part-sheet-slider">
          <span className="label">Busy <span className="muted">· sparse ↔ busy</span></span>
          <input
            type="range"
            className="slider"
            style={{ '--fill': `${intensity / 100}` } as React.CSSProperties}
            min="0"
            max="100"
            step="5"
            value={intensity}
            disabled={!live || busy !== null}
            onChange={(event) => setIntensity(kind, Number(event.target.value) / 100)}
            aria-label={`${name} intensity, sparse to busy`}
          />
        </label>
        <label className="part-sheet-slider">
          <span className="label">{kind === 'drums' ? 'Kit' : 'Keys'} <span className="muted">· {kind === 'drums' ? "the style's drums ↔ the whole kit" : "the style's keys ↔ all the keys"}</span></span>
          <input
            type="range"
            className="slider"
            style={{ '--fill': `${range / 100}` } as React.CSSProperties}
            min="0"
            max="100"
            step="5"
            value={range}
            disabled={!live || busy !== null}
            onChange={(event) => setRange(kind, Number(event.target.value) / 100)}
            aria-label={kind === 'drums' ? "Drums range, the style's drums to the whole kit" : `${name} range, some keys to all keys`}
          />
        </label>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={() => clearLayer(kind)} disabled={!live || busy !== null} aria-label={`Remove the ${name} layer`}>
            <CloseIcon size={12} /> Clear {name}
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </section>
    </Overlay>
  )
}
