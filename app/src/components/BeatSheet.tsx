import { useState } from 'react'
import { bankHasSteps, useGroove } from '../hooks/useGroove'
import { useAppState } from '../state/AppStateContext'
import { BANK_KINDS, BANK_NAMES, getBank } from '../state/banks'
import { styleById, STYLES } from '../styles/library'
import type { Pulse, StyleDef } from '../styles/types'
import { ConfirmDialog } from './ConfirmDialog'
import { DiceIcon, PlusIcon, SparkIcon } from './icons'
import { Overlay } from './Overlay'

/** The style's signature: its first kick, backbeat and hat lines. */
function previewLines(style: StyleDef): Pulse[] {
  const { lines } = style.drums
  return [lines.kick?.[0], lines.snare?.[0] ?? lines.clap?.[0] ?? lines.rim?.[0], lines.hat?.[0] ?? lines.shaker?.[0]].filter(
    (line): line is Pulse => !!line,
  )
}

interface BeatSheetProps {
  onClose: () => void
  /** A whole new beat was written — the sequencer folds to it. */
  onStarted?: () => void
}

/**
 * The answer to a blank canvas. Pick a style, then either start a whole beat
 * in it (tempo, mood, every bank's sound and all four layers at once) or
 * build one layer at a time — each layer can be rerolled for a new take
 * while the others stay put, and all layers of a beat share one chord
 * progression so they fit. Styles are data (src/styles/library.ts).
 */
export function BeatSheet({ onClose, onStarted }: BeatSheetProps) {
  const { state } = useAppState()
  const { busy, error, startBeat, addLayer } = useGroove()
  const [styleId, setStyleId] = useState(state.groove?.styleId ?? STYLES[0]!.id)
  const [confirmStart, setConfirmStart] = useState(false)
  const style = styleById(styleId) ?? STYLES[0]!
  const anySteps = state.banks.some((bank) => bankHasSteps(state, bank))
  const fromThisBeat = state.groove?.styleId === style.id

  const start = async () => {
    setConfirmStart(false)
    await startBeat(style)
    onStarted?.()
    onClose()
  }

  return (
    <Overlay onClose={onClose} title="Beat" subtitle="Pick a style — start a whole beat, or build it one layer at a time.">
      {error && <p className="sheet-error" role="alert">{error}</p>}
      <section className="sheet-section" aria-label="Styles">
        <div className="style-grid" role="radiogroup" aria-label="Style">
          {STYLES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={item.id === style.id}
              className={item.id === style.id ? 'style-card on' : 'style-card'}
              onClick={() => setStyleId(item.id)}
              disabled={busy !== null}
            >
              <span className="style-card-head">
                <span className="style-card-name">{item.name}</span>
                <span className="style-card-bpm readout">{item.bpm[0]}–{item.bpm[1]}</span>
              </span>
              <span className="style-card-blurb">{item.blurb}</span>
              <span className="style-preview" aria-hidden="true">
                {previewLines(item).map((line, row) => (
                  <span className="style-preview-row" key={row}>
                    {[...line.slice(0, 16)].map((char, i) => (
                      <span key={i} className={char === 'x' ? 'style-preview-cell on' : char === 'o' ? 'style-preview-cell often' : 'style-preview-cell'} />
                    ))}
                  </span>
                ))}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-primary beat-start"
          onClick={() => (anySteps ? setConfirmStart(true) : void start())}
          disabled={busy !== null}
        >
          <SparkIcon size={16} />
          {busy === `start:${style.id}` ? 'Building…' : `Start a ${style.name} beat`}
        </button>
      </section>

      <section className="sheet-section" aria-label="Layers">
        <h3 className="label">Or one layer at a time</h3>
        <div className="layer-list">
          {BANK_KINDS.map((kind) => {
            const bank = getBank(state, kind)
            const has = bankHasSteps(state, bank)
            const take = fromThisBeat ? state.groove?.takes[kind] : undefined
            const label = busy === `${kind}:${style.id}` ? 'Writing…' : has ? 'New take' : 'Add'
            return (
              <div className="layer-row" key={kind}>
                <span className="layer-row-name">{BANK_NAMES[kind]}</span>
                <span className="layer-row-status">
                  {has ? (take !== undefined && fromThisBeat ? `${style.name} · take ${take + 1}` : 'Has steps') : 'Empty'}
                </span>
                <button type="button" className="chip-btn" onClick={() => void addLayer(style, kind)} disabled={busy !== null}>
                  {has ? <DiceIcon size={14} /> : <PlusIcon size={14} />}
                  {label}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {confirmStart && (
        <ConfirmDialog
          message={`Start a ${style.name} beat? It replaces this pattern and every bank's sound (your recordings stay in the Library).`}
          confirmLabel="Start"
          onConfirm={() => void start()}
          onCancel={() => setConfirmStart(false)}
        />
      )}
    </Overlay>
  )
}
