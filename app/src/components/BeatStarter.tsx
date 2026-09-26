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
import { CloseIcon, DiceIcon, LockIcon, MoreIcon } from './icons'

/** The style menu's action: a different random style on every pick. */
const SURPRISE = 'surprise'
/** Any style, at random — Surprise me. */
function randomStyle(): StyleDef {
  return STYLES[Math.floor(Math.random() * STYLES.length)]!
}

/** Vary reshapes the notes already there; endings live in Song → Ending / transition. */
const VARY = VARIATIONS.filter((item) => item.id === 'sparser' || item.id === 'busier' || item.id === 'syncopated')

/**
 * Make a beat, at the top of the sequencer (foldable down to its title).
 *
 * - The style menu at the top sets every unlocked part at once (🎲 Surprise
 *   me picks one at random) — with nothing locked, that's a whole new beat.
 * - One compact row per part: its own style (overrides just that part), a
 *   lock, and 🎲 for a new take; › opens its Busy and Keys/Kit sliders and
 *   Clear, one part at a time.
 * - Generate gives every unlocked part a new take in its own style; on an
 *   empty pattern it makes a whole beat in a random style. Bars and New
 *   sounds sit behind ⋯.
 * - Vary (Sparser / Busier / More syncopated) reshapes the unlocked parts'
 *   notes, auditioned with Keep / Undo.
 *
 * Locks belong to the pattern (Pattern.variationLocks), so they're kept with it.
 */
export function BeatStarter() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { goToSong, beatStarterOpen: open, setBeatStarterOpen, markBeatStarted } = useNavigation()
  const { busy, error, startBeat, regenerateLayers, hearBeat, setLayerStyle, newTake, setIntensity, setRange, clearLayer, newChords } = useGroove()
  const [bars, setBars] = useState<1 | 2 | 4>((state.groove?.bars as 1 | 2 | 4) ?? 2)
  const [newSounds, setNewSounds] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [expanded, setExpanded] = useState<BankKind | null>(null)
  const [pendingStyle, setPendingStyle] = useState<{ style: StyleDef; surprise: boolean } | null>(null)
  const [notice, setNotice] = useState('')
  const pattern = state.patterns.find((item) => item.id === state.activePatternId)
  const locked = pattern?.variationLocks ?? []
  const unlocked = BANK_KINDS.filter((kind) => !locked.includes(kind))
  const hasSteps = state.banks.some((bank) => bankHasSteps(state, bank))
  const live = (kind: BankKind) => !!state.groove?.layers[kind] && bankHasSteps(state, getBank(state, kind))
  const liveStyles = [...new Set(BANK_KINDS.filter(live).map((kind) => state.groove!.layers[kind]!.styleId))]
  const sharedStyle = liveStyles.length === 1 ? liveStyles[0]! : ''
  const editingSection =
    state.transport.auditionScope === 'loop' ? state.songSections.find((section) => section.id === state.transport.auditionSectionId) : undefined

  const toggleLock = (kind: BankKind) =>
    dispatch({ type: 'SET_VARIATION_LOCKS', locked: locked.includes(kind) ? locked.filter((item) => item !== kind) : BANK_KINDS.filter((item) => item === kind || locked.includes(item)) })

  /** A whole new beat in `style` (tempo, chords, sounds) when nothing is locked; otherwise just the unlocked parts. */
  const applyStyle = async (style: StyleDef, surprise: boolean) => {
    setPendingStyle(null)
    setNotice('')
    engine.getContext() // unlock audio on the gesture, before the instruments render
    const whole = unlocked.length === BANK_KINDS.length
    const ok = whole
      ? await startBeat(style, { bars, kinds: unlocked, keepSounds: !newSounds })
      : await regenerateLayers(unlocked, () => style, { newSounds })
    if (!ok) return
    if (surprise) setNotice(`Surprise: ${style.name}`)
    if (whole) markBeatStarted()
    hearBeat()
  }
  const pickStyle = (value: string) => {
    const surprise = value === SURPRISE
    const style = surprise ? randomStyle() : styleById(value)
    if (!style || unlocked.length === 0) return
    // Replacing a whole beat that's already there asks first.
    if (unlocked.length === BANK_KINDS.length && hasSteps) setPendingStyle({ style, surprise })
    else void applyStyle(style, surprise)
  }

  /** New takes of the unlocked parts, each in its own style — or, on an empty pattern, a whole beat in a random style. */
  const generate = async () => {
    if (!hasSteps || !state.groove) return pickStyle(SURPRISE)
    setNotice('')
    engine.getContext()
    const fallback = styleById(sharedStyle) ?? randomStyle()
    const ok = await regenerateLayers(unlocked, (kind) => styleById(state.groove?.layers[kind]?.styleId ?? '') ?? fallback, { newSounds })
    if (ok) hearBeat()
  }

  const vary = (kind: VariationKind) => {
    if (!pattern) return
    const seed = newSeed()
    const proposed = varyPattern(state, pattern, kind, locked, seed)
    if (JSON.stringify(proposed.steps) === JSON.stringify(pattern.steps)) {
      setNotice('Nothing to change there in the unlocked parts.')
      return
    }
    setNotice('')
    dispatch({ type: 'PREVIEW_VARIATION', kind, locked, seed })
    hearBeat()
  }

  const building = busy?.startsWith('start:') || busy?.startsWith('layers:')
  const generateLabel = building
    ? 'Building…'
    : unlocked.length === 0
    ? 'All parts locked'
    : !hasSteps
    ? 'Generate'
    : unlocked.length === BANK_KINDS.length
    ? 'Generate again'
    : `Generate ${unlocked.map((kind) => BANK_NAMES[kind]).join(' + ')}`

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
          <select
            className="beat-style-all"
            value={sharedStyle}
            onChange={(event) => pickStyle(event.target.value)}
            disabled={busy !== null || unlocked.length === 0}
            aria-label="Style for every unlocked part"
            title="Set every unlocked part to one style — with nothing locked, a whole new beat"
          >
            <option value="" disabled>{liveStyles.length > 1 ? 'Mixed styles' : 'Style…'}</option>
            <option value={SURPRISE}>🎲 Surprise me</option>
            {STYLES.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        )}
      </header>
      {open && <>
      <div className="beat-layers" role="group" aria-label="Parts">
        {BANK_KINDS.map((kind) => {
          const layer = state.groove?.layers[kind]
          const isLive = live(kind)
          const isLocked = locked.includes(kind)
          const isOpen = expanded === kind
          const layerIntensity = Math.round((layer?.intensity ?? 0.5) * 100)
          const layerRange = Math.round((layer?.range ?? 0) * 100)
          return (
            <div className={['beat-layer', isLive ? 'live' : '', isLocked ? 'locked' : '', isOpen ? 'open' : ''].filter(Boolean).join(' ')} key={kind}>
              <span className="beat-layer-name">{BANK_NAMES[kind]}</span>
              <select
                className="beat-layer-style"
                value={isLive && layer ? layer.styleId : ''}
                onChange={(event) => { const style = styleById(event.target.value); if (style) { engine.getContext(); void setLayerStyle(kind, style) } }}
                disabled={busy !== null}
                aria-label={`${BANK_NAMES[kind]} style`}
                title={isLive && layer ? `Take ${layer.take + 1}` : `Put a style's ${BANK_NAMES[kind].toLowerCase()} in this part`}
              >
                <option value="" disabled>{busy?.startsWith(`${kind}:`) ? 'Building…' : 'Style…'}</option>
                {STYLES.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select>
              <button
                type="button"
                className={isLocked ? 'icon-btn icon-btn-sm beat-lock on' : 'icon-btn icon-btn-sm beat-lock'}
                aria-pressed={isLocked}
                aria-label={`Lock ${BANK_NAMES[kind]}`}
                title={isLocked ? `${BANK_NAMES[kind]} is locked — Generate, the style menu and Vary leave it alone` : `Lock ${BANK_NAMES[kind]} so Generate leaves it alone`}
                onClick={() => toggleLock(kind)}
              >
                <LockIcon size={15} open={!isLocked} />
              </button>
              <button type="button" className="icon-btn icon-btn-sm" onClick={() => newTake(kind)} disabled={!isLive || busy !== null} aria-label={`New take of the ${BANK_NAMES[kind]} layer`} title="New take">
                <DiceIcon size={14} />
              </button>
              <button
                type="button"
                className="icon-btn icon-btn-sm beat-layer-more"
                aria-expanded={isOpen}
                aria-label={`${BANK_NAMES[kind]} settings`}
                onClick={() => setExpanded(isOpen ? null : kind)}
              >
                <span aria-hidden="true">{isOpen ? '⌄' : '›'}</span>
              </button>
              {isOpen && (
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
                      disabled={!isLive || busy !== null}
                      onChange={(event) => setIntensity(kind, Number(event.target.value) / 100)}
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
                      disabled={!isLive || busy !== null}
                      onChange={(event) => setRange(kind, Number(event.target.value) / 100)}
                      aria-label={kind === 'drums' ? "Drums range, the style's drums to the whole kit" : `${BANK_NAMES[kind]} range, some keys to all keys`}
                    />
                  </label>
                  <button type="button" className="chip-btn beat-layer-clear" onClick={() => clearLayer(kind)} disabled={!isLive || busy !== null} aria-label={`Remove the ${BANK_NAMES[kind]} layer`}>
                    <CloseIcon size={12} /> Clear {BANK_NAMES[kind]}
                  </button>
                </div>
              )}
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
      <div className="beat-generate-row">
        <button type="button" className="btn btn-primary beat-generate" disabled={busy !== null || unlocked.length === 0} onClick={() => void generate()}>
          <DiceIcon size={16} />
          {generateLabel}
        </button>
        <button
          type="button"
          className={moreOpen ? 'icon-btn on beat-more' : 'icon-btn beat-more'}
          aria-expanded={moreOpen}
          aria-label="More beat settings"
          title="Beat length and new sounds"
          onClick={() => setMoreOpen((value) => !value)}
        >
          <MoreIcon />
        </button>
      </div>
      {moreOpen && (
        <div className="beat-settings">
          <label className="beat-setting">
            <span className="label label-dim">Length</span>
            <select
              aria-label="Beat length"
              value={bars}
              onChange={(event) => setBars(Number(event.target.value) as 1 | 2 | 4)}
              disabled={busy !== null}
              title="Length of a whole new beat"
            >
              {[1, 2, 4].map((length) => (
                <option key={length} value={length}>
                  {length} {length === 1 ? 'bar' : 'bars'}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={newSounds ? 'chip-btn on' : 'chip-btn'}
            aria-pressed={newSounds}
            onClick={() => setNewSounds((value) => !value)}
            disabled={busy !== null}
            title={newSounds ? "Parts get their style's instruments" : 'Your instruments and key stay'}
          >
            New sounds
          </button>
        </div>
      )}
      {hasSteps && (
        <div className="beat-tweaks" role="group" aria-label="Vary the unlocked parts">
          <span className="label label-dim">Vary</span>
          {VARY.map((item) => (
            <button
              type="button"
              className="chip-btn"
              key={item.id}
              disabled={busy !== null || unlocked.length === 0 || !!state.variationPreview}
              onClick={() => vary(item.id)}
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
      {pendingStyle && (
        <ConfirmDialog
          message={`Start a whole new ${pendingStyle.style.name} beat in ${pattern?.name ?? 'this pattern'}? It replaces every part, the chords and the tempo — lock a part to keep it. Song parts using this pattern change too.`}
          confirmLabel="Start"
          onConfirm={() => void applyStyle(pendingStyle.style, pendingStyle.surprise)}
          onCancel={() => setPendingStyle(null)}
        />
      )}
    </section>
  )
}

/** Make a beat for the pattern in the grid — starting fresh (its options, notice) whenever the pattern changes. */
export function PatternBeatStarter() {
  const { state } = useAppState()
  return <BeatStarter key={state.activePatternId} />
}
