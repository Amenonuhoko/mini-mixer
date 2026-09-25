import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { bankHasSteps, useGroove } from '../hooks/useGroove'
import { useIsWideScreen } from '../hooks/useIsWideScreen'
import { useAppState } from '../state/AppStateContext'
import { BANK_KINDS, BANK_NAMES, getBank } from '../state/banks'
import { progressionNames } from '../styles/generator'
import { STYLES, styleById } from '../styles/library'
import type { Pulse, StyleDef } from '../styles/types'
import { ConfirmDialog } from './ConfirmDialog'
import { CloseIcon, DiceIcon, SparkIcon } from './icons'


/** The style's signature: its first kick, backbeat and hat lines. */
function previewLines(style: StyleDef): Pulse[] {
  const { lines } = style.drums
  return [lines.kick?.[0], lines.snare?.[0] ?? lines.clap?.[0] ?? lines.rim?.[0], lines.hat?.[0] ?? lines.shaker?.[0]].filter(
    (line): line is Pulse => !!line,
  )
}

interface StyleDockProps {
  onClose: () => void
  /** A whole new beat was written — the sequencer folds to it. */
  onStarted: () => void
}

/**
 * The preset library, docked where the beat is built — inline under the
 * sequencer on wide screens, a drawer above the tab bar on phones — and
 * never modal, so the beat keeps playing and stays in reach while you
 * browse. See StyleBrowser.
 */
export function StyleDock(props: StyleDockProps) {
  const isWide = useIsWideScreen()
  useEffect(() => {
    if (isWide) return
    document.body.classList.add('style-drawer-open')
    return () => document.body.classList.remove('style-drawer-open')
  }, [isWide])
  if (isWide) {
    return (
      <section className="module style-dock" aria-label="Styles">
        <StyleBrowser {...props} />
      </section>
    )
  }
  return createPortal(
    <section className="style-drawer" aria-label="Styles">
      <StyleBrowser {...props} />
    </section>,
    document.body,
  )
}

/**
 * Presets as the building blocks of the beat you're making:
 *
 * - The mix: what each bank is playing — its style, its sparse ↔ busy
 *   intensity, a new take, or remove — and the beat's chords, which every
 *   preset layer follows (New chords rewrites them all to a new progression).
 * - The library: every style, with a one-tap button per layer to drop that
 *   style's drums, bass, chords or melody into its bank — so layers mix
 *   across styles (Trap drums under a Funk bassline) — or a whole beat.
 */
function StyleBrowser({ onClose, onStarted }: StyleDockProps) {
  const { state } = useAppState()
  const { busy, error, startBeat, setLayerStyle, newTake, setIntensity, clearLayer, newChords } = useGroove()
  const [pendingStart, setPendingStart] = useState<StyleDef | null>(null)
  const groove = state.groove
  const anySteps = state.banks.some((bank) => bankHasSteps(state, bank))
  const chords = groove ? progressionNames(state.key, groove.progression) : []

  const start = async (style: StyleDef) => {
    setPendingStart(null)
    await startBeat(style)
    onStarted()
  }

  return (
    <div className="style-browser">
      <header className="style-browser-head">
        <h2 className="module-title">Layer presets</h2>
        {groove ? (
          <span className="style-browser-chords" title="The chords every preset layer follows">
            {chords.join(' · ')}
          </span>
        ) : (
          <span className="style-browser-chords muted">Tap a layer to start mixing</span>
        )}
        <button
          type="button"
          className="chip-btn"
          onClick={() => void newChords()}
          disabled={!groove || busy !== null}
          title="A new chord progression — every preset layer is rewritten to follow it"
        >
          <DiceIcon size={14} />
          Chords
        </button>
        <button type="button" className="icon-btn icon-btn-sm" onClick={onClose} aria-label="Close styles">
          <CloseIcon size={14} />
        </button>
      </header>
      {error && <p className="sheet-error" role="alert">{error}</p>}

      <div className="mix-rows" role="group" aria-label="Layers in this beat">
        {BANK_KINDS.map((kind) => {
          const layer = groove?.layers[kind]
          const style = layer ? styleById(layer.styleId) : undefined
          const live = !!layer && bankHasSteps(state, getBank(state, kind))
          const intensity = Math.round((layer?.intensity ?? 0.5) * 100)
          return (
            <div className={live ? 'mix-row live' : 'mix-row'} key={kind}>
              <span className="mix-row-bank">{BANK_NAMES[kind]}</span>
              <span className="mix-row-style">{live && style ? `${style.name} · ${layer.take + 1}` : '—'}</span>
              <input
                type="range"
                className="slider mix-row-intensity"
                style={{ '--fill': `${intensity / 100}` } as React.CSSProperties}
                min="0"
                max="100"
                step="5"
                value={intensity}
                disabled={!live || busy !== null}
                onChange={(event) => setIntensity(kind, Number(event.target.value) / 100)}
                aria-label={`${BANK_NAMES[kind]} intensity, sparse to busy`}
                title="Sparse ↔ busy"
              />
              <button
                type="button"
                className="icon-btn icon-btn-sm"
                onClick={() => newTake(kind)}
                disabled={!live || busy !== null}
                aria-label={`New take of the ${BANK_NAMES[kind]} layer`}
                title="New take"
              >
                <DiceIcon size={14} />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn-sm"
                onClick={() => clearLayer(kind)}
                disabled={!live || busy !== null}
                aria-label={`Remove the ${BANK_NAMES[kind]} layer`}
                title="Remove this layer's steps"
              >
                <CloseIcon size={12} />
              </button>
            </div>
          )
        })}
      </div>

      <div className="style-grid">
        {STYLES.map((style) => (
          <div className="style-card" key={style.id}>
            <span className="style-card-head">
              <span className="style-card-name">{style.name}</span>
              <span className="style-card-bpm readout">{style.bpm[0]}–{style.bpm[1]}</span>
            </span>
            <span className="style-card-blurb">{style.blurb}</span>
            <span className="style-preview" aria-hidden="true">
              {previewLines(style).map((line, row) => (
                <span className="style-preview-row" key={row}>
                  {[...line.slice(0, 16)].map((char, i) => (
                    <span key={i} className={char === 'x' ? 'style-preview-cell on' : char === 'o' ? 'style-preview-cell often' : 'style-preview-cell'} />
                  ))}
                </span>
              ))}
            </span>
            <span className="style-card-layers">
              {BANK_KINDS.map((kind) => {
                const on = groove?.layers[kind]?.styleId === style.id && bankHasSteps(state, getBank(state, kind))
                return (
                  <button
                    key={kind}
                    type="button"
                    className={on ? 'layer-add on' : 'layer-add'}
                    onClick={() => void setLayerStyle(kind, style)}
                    disabled={busy !== null}
                    aria-pressed={on}
                    aria-label={`${on ? 'New take of' : 'Add'} ${style.name} ${BANK_NAMES[kind].toLowerCase()}`}
                    title={on ? `Playing — tap for a new take` : `Put ${style.name} ${BANK_NAMES[kind].toLowerCase()} in the ${BANK_NAMES[kind]} bank`}
                  >
                    {busy === `${kind}:${style.id}` ? '…' : BANK_NAMES[kind]}
                  </button>
                )
              })}
              <button
                type="button"
                className="layer-add whole"
                onClick={() => (anySteps ? setPendingStart(style) : void start(style))}
                disabled={busy !== null}
                aria-label={`Start a whole ${style.name} beat`}
                title="A whole beat in this style — tempo, mood, sounds and all four layers"
              >
                {busy === `start:${style.id}` ? '…' : <><SparkIcon size={12} /> Whole beat</>}
              </button>
            </span>
          </div>
        ))}
      </div>

      {pendingStart && (
        <ConfirmDialog
          message={`Start a whole ${pendingStart.name} beat? It replaces this pattern and every bank's sound (your recordings stay in the Library). To keep what you have, add single layers instead.`}
          confirmLabel="Start"
          onConfirm={() => void start(pendingStart)}
          onCancel={() => setPendingStart(null)}
        />
      )}
    </div>
  )
}
