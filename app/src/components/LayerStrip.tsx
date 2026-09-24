import { useEffect, useRef } from 'react'
import { bankHasSteps, useGroove } from '../hooks/useGroove'
import { useAppState } from '../state/AppStateContext'
import { BANK_NAMES, getBank } from '../state/banks'
import type { BankKind } from '../state/types'
import { STYLES } from '../styles/library'
import { DiceIcon } from './icons'

interface LayerStripProps {
  kind: BankKind
}

/**
 * One bank's preset controls, right where that bank is played or
 * sequenced: a scrollable row of styles (tap one to put its layer in this
 * bank — the lit one is playing; tap it again for a new take), plus the
 * layer's sparse ↔ busy intensity and a reroll. Any bank can take any
 * style; the beat's shared chords keep them fitting together.
 */
export function LayerStrip({ kind }: LayerStripProps) {
  const { state } = useAppState()
  const { busy, setLayerStyle, newTake, setIntensity } = useGroove()
  const layer = state.groove?.layers[kind]
  const hasLayer = !!layer && bankHasSteps(state, getBank(state, kind))
  const intensity = Math.round((layer?.intensity ?? 0.5) * 100)
  const stylesRef = useRef<HTMLDivElement>(null)
  const litId = hasLayer ? layer.styleId : null

  // Keep the playing style in view (scrolling only the strip, never the page).
  useEffect(() => {
    const row = stylesRef.current
    const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!row || !chip) return
    const chipBox = chip.getBoundingClientRect()
    const rowBox = row.getBoundingClientRect()
    row.scrollTo({ left: row.scrollLeft + chipBox.left - rowBox.left - (row.clientWidth - chipBox.width) / 2, behavior: 'smooth' })
  }, [litId, kind])

  return (
    <div className="layer-strip" role="group" aria-label={`${BANK_NAMES[kind]} presets`}>
      <div className="layer-strip-controls">
        <button
          type="button"
          className="icon-btn icon-btn-sm"
          onClick={() => newTake(kind)}
          disabled={!hasLayer || busy !== null}
          aria-label={`New take of the ${BANK_NAMES[kind]} layer`}
          title="New take — same style, different variation"
        >
          <DiceIcon size={14} />
        </button>
        <input
          type="range"
          className="slider layer-intensity"
          style={{ '--fill': `${intensity / 100}` } as React.CSSProperties}
          min="0"
          max="100"
          step="5"
          value={intensity}
          disabled={!hasLayer || busy !== null}
          onChange={(event) => setIntensity(kind, Number(event.target.value) / 100)}
          aria-label={`${BANK_NAMES[kind]} intensity, sparse to busy`}
          title="Sparse ↔ busy"
        />
      </div>
      <span className="layer-strip-label" aria-hidden="true">Style</span>
      <div className="layer-strip-styles" ref={stylesRef}>
        {STYLES.map((style) => {
          const on = layer?.styleId === style.id && hasLayer
          const job = `${kind}:${style.id}`
          return (
            <button
              key={style.id}
              type="button"
              className={on ? 'chip-btn on' : 'chip-btn'}
              onClick={() => void setLayerStyle(kind, style)}
              disabled={busy !== null}
              aria-pressed={on}
              title={on ? `${style.name} ${BANK_NAMES[kind].toLowerCase()} — tap for a new take` : `Put ${style.name} ${BANK_NAMES[kind].toLowerCase()} here`}
            >
              {busy === job ? '…' : style.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
