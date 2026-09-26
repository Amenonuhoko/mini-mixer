import { useState } from 'react'
import { bankHasSteps, useGroove } from '../hooks/useGroove'
import { useAppState } from '../state/AppStateContext'
import { useNavigation } from '../state/NavigationContext'
import { useEngine } from '../state/EngineContext'
import { BANK_KINDS, BANK_NAMES, getBank } from '../state/banks'
import type { BankKind } from '../state/types'
import { progressionNames } from '../styles/generator'
import { STYLES, styleById } from '../styles/library'
import { newSeed } from '../styles/random'
import type { StyleDef } from '../styles/types'
import { VARIATIONS, varyPattern, type VariationKind } from '../styles/variations'
import { ConfirmDialog } from './ConfirmDialog'
import { CloseIcon, DiceIcon } from './icons'

const LEVELS = [
  { name: 'Simple', value: 0.1 },
  { name: 'Balanced', value: 0.5 },
  { name: 'Complex', value: 0.9 },
]

/** The style list's first choice: a different random style on every press. */
const SURPRISE = 'surprise'

/**
 * Make a beat, at the top of the sequencer (and foldable down to its title):
 * one row per part — pick it for Generate, and set its own style, sparse ↔
 * busy intensity, a new take, or clear it — then the beat's chords (every
 * style layer follows them). Generate gives every picked part fresh, randomly
 * generated material (from the chosen style, or a random one); parts left out
 * stay exactly as they are — all four on a beat is a whole new beat. The
 * Tweak row reshapes just the picked parts of what's there (sparser, busier,
 * a fill…), auditioned with Keep / Undo. This is the one home for styles.
 */
export function BeatStarter() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { goToSong, beatStarterOpen: open, setBeatStarterOpen, markBeatStarted } = useNavigation()
  const { busy, error, startBeat, regenerateLayers, hearBeat, setLayerStyle, newTake, setIntensity: setLayerIntensity, setRange: setLayerRange, clearLayer, newChords } = useGroove()
  const [styleId, setStyleId] = useState<string>(SURPRISE)
  const [intensity, setIntensity] = useState(0.5)
  const [bars, setBars] = useState<1 | 2 | 4>((state.groove?.bars as 1 | 2 | 4) ?? 2)
  const [kinds, setKinds] = useState<BankKind[]>([...BANK_KINDS])
  const [newSounds, setNewSounds] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [notice, setNotice] = useState('')
  // Style, busyness, length and tweaks fold away once there's a beat; parts and Generate always show.
  const [optionsOpen, setOptionsOpen] = useState(() => !state.banks.some((bank) => bankHasSteps(state, bank)))
  const hasSteps = state.banks.some((bank) => bankHasSteps(state, bank))
  const pattern = state.patterns.find((item) => item.id === state.activePatternId)
  const whole = kinds.length === BANK_KINDS.length || !hasSteps
  const editingSection =
    state.transport.auditionScope === 'loop' ? state.songSections.find((section) => section.id === state.transport.auditionSectionId) : undefined

  const pickStyle = (): StyleDef =>
    styleId === SURPRISE ? STYLES[Math.floor(Math.random() * STYLES.length)]! : (STYLES.find((item) => item.id === styleId) ?? STYLES[0]!)

  const generate = async () => {
    setConfirm(false)
    setNotice('')
    // Unlock audio on the gesture, before asynchronous instrument rendering.
    engine.getContext()
    const style = pickStyle()
    const ok = whole
      ? await startBeat(style, { intensity, bars, kinds, keepSounds: !newSounds })
      : await regenerateLayers(kinds, style, { intensity, newSounds })
    if (ok) {
      if (styleId === SURPRISE) setNotice(`Surprise: ${style.name}`)
      if (whole) markBeatStarted()
      hearBeat()
    }
  }

  const tweak = (kind: VariationKind) => {
    if (!pattern) return
    const locked = BANK_KINDS.filter((item) => !kinds.includes(item))
    const seed = newSeed()
    const proposed = varyPattern(state, pattern, kind, locked, seed)
    if (JSON.stringify(proposed.steps) === JSON.stringify(pattern.steps)) {
      setNotice('Nothing to change there with these parts — for a fill or crash, the drums need a kit with those sounds.')
      return
    }
    setNotice('')
    dispatch({ type: 'PREVIEW_VARIATION', kind, locked, seed })
    hearBeat()
  }

  const toggleKind = (kind: BankKind) =>
    setKinds((current) => (current.includes(kind) ? current.filter((item) => item !== kind) : BANK_KINDS.filter((item) => item === kind || current.includes(item))))

  return (
    <section className={open ? 'module beat-starter' : 'module beat-starter folded'} aria-label="Make a beat">
      {editingSection && (
        <div className="beat-edit-context">
          <strong>Editing {editingSection.name} · section loops</strong>
          <button type="button" className="chip-btn" onClick={goToSong}>
            Back to song
          </button>
        </div>
      )}
      <header className="module-head">
        <button type="button" className="beat-fold" aria-expanded={open} onClick={() => setBeatStarterOpen((value) => !value)} aria-label={open ? 'Hide Make a beat' : 'Show Make a beat'}>
          <h2 className="module-title">Make a beat</h2>
          <span className="beat-fold-chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
        {open && (
          <button
            type="button"
            className={optionsOpen ? 'chip-btn on beat-options-toggle' : 'chip-btn beat-options-toggle'}
            aria-expanded={optionsOpen}
            onClick={() => setOptionsOpen((value) => !value)}
          >
            Options {optionsOpen ? '▴' : '▾'}
          </button>
        )}
      </header>
      {open && <>
      <div className="beat-layers" role="group" aria-label="Parts">
        {BANK_KINDS.map((kind) => {
          const layer = state.groove?.layers[kind]
          const live = !!layer && bankHasSteps(state, getBank(state, kind))
          const layerIntensity = Math.round((layer?.intensity ?? 0.5) * 100)
          const layerRange = Math.round((layer?.range ?? 0) * 100)
          return (
            <div className={live ? 'beat-layer live' : 'beat-layer'} key={kind}>
              <button
                type="button"
                className={kinds.includes(kind) ? 'chip-btn on beat-layer-pick' : 'chip-btn beat-layer-pick'}
                aria-pressed={kinds.includes(kind)}
                aria-label={`${BANK_NAMES[kind]}: ${kinds.includes(kind) ? 'picked for Generate' : 'left as it is'}`}
                title="Pick this part for Generate and Tweak"
                onClick={() => toggleKind(kind)}
                disabled={busy !== null}
              >
                {BANK_NAMES[kind]}
              </button>
              <select
                className="beat-layer-style"
                value={live && layer ? layer.styleId : ''}
                onChange={(event) => { const style = styleById(event.target.value); if (style) { engine.getContext(); void setLayerStyle(kind, style) } }}
                disabled={busy !== null}
                aria-label={`${BANK_NAMES[kind]} style`}
                title={live && layer ? `Take ${layer.take + 1}` : `Put a style's ${BANK_NAMES[kind].toLowerCase()} in this part`}
              >
                <option value="" disabled>{busy?.startsWith(`${kind}:`) ? 'Building…' : 'Style…'}</option>
                {STYLES.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select>
              <button type="button" className="icon-btn icon-btn-sm" onClick={() => newTake(kind)} disabled={!live || busy !== null} aria-label={`New take of the ${BANK_NAMES[kind]} layer`} title="New take">
                <DiceIcon size={14} />
              </button>
              <button type="button" className="icon-btn icon-btn-sm" onClick={() => clearLayer(kind)} disabled={!live || busy !== null} aria-label={`Remove the ${BANK_NAMES[kind]} layer`} title="Remove this layer's steps">
                <CloseIcon size={12} />
              </button>
              <div className="beat-layer-sliders">
                <label className="beat-layer-slider" title="Sparse ↔ busy">
                  <span className="label label-dim">Busy</span>
                  <input
                    type="range"
                    className="slider beat-layer-intensity"
                    style={{ '--fill': `${layerIntensity / 100}` } as React.CSSProperties}
                    min="0"
                    max="100"
                    step="5"
                    value={layerIntensity}
                    disabled={!live || busy !== null}
                    onChange={(event) => setLayerIntensity(kind, Number(event.target.value) / 100)}
                    aria-label={`${BANK_NAMES[kind]} intensity, sparse to busy`}
                  />
                </label>
                <label className="beat-layer-slider" title={kind === 'drums' ? "The style's drums ↔ the whole kit" : "The style's keys ↔ all the keys"}>
                  <span className="label label-dim">{kind === 'drums' ? 'Kit' : 'Keys'}</span>
                  <input
                    type="range"
                    className="slider beat-layer-range"
                    style={{ '--fill': `${layerRange / 100}` } as React.CSSProperties}
                    min="0"
                    max="100"
                    step="5"
                    value={layerRange}
                    disabled={!live || busy !== null}
                    onChange={(event) => setLayerRange(kind, Number(event.target.value) / 100)}
                    aria-label={kind === 'drums' ? 'Drums range, the style\'s drums to the whole kit' : `${BANK_NAMES[kind]} range, some keys to all keys`}
                  />
                </label>
              </div>
            </div>
          )
        })}
      </div>
      {state.groove && (
        <div className="beat-chords">
          <span className="label label-dim">Chords</span>
          <span className="beat-chords-names">{progressionNames(state.key, state.groove.progression).join(' · ')}</span>
          <button type="button" className="chip-btn" onClick={() => void newChords()} disabled={busy !== null} title="A new chord progression — every style layer is rewritten to follow it" aria-label="New chords">
            <DiceIcon size={14} /> New
          </button>
        </div>
      )}
      {optionsOpen && (
      <div className="beat-settings">
        <select value={styleId} onChange={(event) => setStyleId(event.target.value)} disabled={busy !== null} aria-label="Style">
          <option value={SURPRISE}>🎲 Surprise me</option>
          {STYLES.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name} · {item.bpm[0]}–{item.bpm[1]}
            </option>
          ))}
        </select>
        <div className="segmented segmented-sm" role="group" aria-label="How busy">
          {LEVELS.map((level) => (
            <button
              type="button"
              key={level.name}
              className={intensity === level.value ? 'segment on' : 'segment'}
              aria-pressed={intensity === level.value}
              onClick={() => setIntensity(level.value)}
              disabled={busy !== null}
            >
              {level.name}
            </button>
          ))}
        </div>
        <select
          aria-label="Beat length"
          value={bars}
          onChange={(event) => setBars(Number(event.target.value) as 1 | 2 | 4)}
          disabled={busy !== null || !whole}
          title={whole ? 'Length of the new beat' : 'Parts are generated across the pattern as it is'}
        >
          {[1, 2, 4].map((length) => (
            <option key={length} value={length}>
              {length} {length === 1 ? 'bar' : 'bars'}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={newSounds ? 'chip-btn on' : 'chip-btn'}
          aria-pressed={newSounds}
          onClick={() => setNewSounds((value) => !value)}
          disabled={busy !== null}
          title={newSounds ? "The picked parts get the style's instruments" : 'Your instruments and key stay'}
        >
          New sounds
        </button>
      </div>
      )}
      <button
        type="button"
        className="btn btn-primary beat-generate"
        disabled={busy !== null || kinds.length === 0}
        onClick={() => (whole && hasSteps ? setConfirm(true) : void generate())}
      >
        <DiceIcon size={16} />
        {busy?.startsWith('start:') || busy?.startsWith('layers:') ? 'Building…' : !whole ? `Generate ${kinds.map((kind) => BANK_NAMES[kind]).join(' + ')}` : hasSteps ? 'Generate again' : 'Generate'}
      </button>
      {hasSteps && optionsOpen && (
        <div className="beat-tweaks" role="group" aria-label="Tweak the picked parts">
          <span className="label label-dim">Tweak</span>
          {VARIATIONS.map((item) => (
            <button
              type="button"
              className="chip-btn"
              key={item.id}
              disabled={busy !== null || kinds.length === 0 || !!state.variationPreview}
              onClick={() => tweak(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {notice && (
        <p className="muted beat-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="sheet-error" role="alert">
          {error}
        </p>
      )}
      </>}
      {confirm && (
        <ConfirmDialog
          message={`Replace everything in ${pattern?.name ?? 'this pattern'} with a new beat? Song parts using this pattern change too.${newSounds ? ' Instruments and key change across the song.' : ''}`}
          confirmLabel="Generate"
          onConfirm={() => void generate()}
          onCancel={() => setConfirm(false)}
        />
      )}
    </section>
  )
}
