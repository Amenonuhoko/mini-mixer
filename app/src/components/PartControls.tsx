import { useState } from 'react'
import { DRUM_KITS } from '../engine/drumSynth'
import { bankHasSteps, useGroove } from '../hooks/useGroove'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { BANK_NAMES, getBank } from '../state/banks'
import type { Bank, BankKind } from '../state/types'
import { STYLES, styleById } from '../styles/library'
import { BankSoundPicker } from './BankSoundPicker'
import { CloseIcon, DiceIcon } from './icons'
import { PhrasingEditor } from './PhrasingEditor'

/** What a bank plays, by name: its kit or instrument. */
function soundName(bank: Bank): string {
  if (bank.sound?.type === 'kit') {
    const kitId = bank.sound.kitId
    return DRUM_KITS.find((kit) => kit.id === kitId)?.name ?? 'Kit'
  }
  return bank.sound?.type === 'preset' ? bank.sound.name : 'None yet'
}

/**
 * Everything one part offers, in one place — its own style, a new take, Busy
 * (sparse ↔ busy), Keys / Kit (the style's own ↔ all of the bank's) and
 * Clear; `extras` adds its sound and its phrasing. Used by the sheet on each
 * bank header in Seq and, in full, by Make a beat.
 */
export function PartControls({ kind, extras = false, onDone }: { kind: BankKind; extras?: boolean; onDone?: () => void }) {
  const { state } = useAppState()
  const engine = useEngine()
  const { busy, setLayerStyle, newTake, setIntensity, setRange, clearLayer } = useGroove()
  const [sheet, setSheet] = useState<'sound' | 'phrasing' | null>(null)
  const bank = getBank(state, kind)
  const pattern = state.patterns.find((item) => item.id === state.activePatternId)
  const layer = state.groove?.layers[kind]
  const live = !!layer && bankHasSteps(state, bank)
  const intensity = Math.round((layer?.intensity ?? 0.5) * 100)
  const range = Math.round((layer?.range ?? 0) * 100)
  const name = BANK_NAMES[kind]

  return (
    <div className="part-sheet">
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
      {extras && (
        <div className="part-sheet-more">
          <button type="button" className="btn" onClick={() => setSheet('sound')} disabled={busy !== null} aria-label={`${name} sound`}>
            <span className="muted">{kind === 'drums' ? 'Kit' : 'Sound'}</span> {soundName(bank)}
          </button>
          <button type="button" className="btn" onClick={() => setSheet('phrasing')} disabled={!pattern || busy !== null} aria-label={`Edit ${name} phrasing`}>
            Phrasing
          </button>
        </div>
      )}
      <div className="sheet-actions">
        <button type="button" className="btn" onClick={() => clearLayer(kind)} disabled={!live || busy !== null} aria-label={`Remove the ${name} layer`}>
          <CloseIcon size={12} /> Clear {name}
        </button>
        {onDone && <button type="button" className="btn btn-primary" onClick={onDone}>Done</button>}
      </div>
      {sheet === 'sound' && <BankSoundPicker bank={bank} onClose={() => setSheet(null)} />}
      {sheet === 'phrasing' && pattern && <PhrasingEditor bank={bank} pattern={pattern} onClose={() => setSheet(null)} />}
    </div>
  )
}
