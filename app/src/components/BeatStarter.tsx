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
import { DiceIcon, LockIcon } from './icons'

/** The style menu's action: a different random style on every pick. */
const SURPRISE = 'surprise'
/** Any style, at random — Surprise me. It avoids the styles already in the beat, so a surprise is always a change. */
function randomStyle(avoid: string[] = []): StyleDef {
  const pool = STYLES.filter((item) => !avoid.includes(item.id))
  const from = pool.length > 0 ? pool : STYLES
  return from[Math.floor(Math.random() * from.length)]!
}

/** Vary reshapes the notes already there; endings live in Song → Ending / transition. */
const VARY = VARIATIONS.filter((item) => item.id === 'sparser' || item.id === 'busier' || item.id === 'syncopated')

/** The style menu's value when parts differ: Generate keeps each part in its own style. */
const OWN = 'own'

/**
 * Make a beat, at the top of the sequencer (foldable down to its title):
 * a style menu and Generate, the four parts (🎲 to shuffle just that one
 * instrument, 🔒 to keep it so Generate and Vary leave it alone), and a small
 * Vary row. Each part's own style, takes and feel live on its bank header in
 * Seq (PartSheet).
 *
 * Generate writes every unlocked part in the chosen style — 🎲 Surprise me
 * picks one at random, and when the parts are in different styles it keeps
 * each part's own. A new style brings its instruments; the same style keeps
 * yours and gives a new take. With nothing locked and a new style (or an
 * empty pattern) it's a whole new beat — tempo and chords too — and over an
 * existing beat that asks first.
 */
export function BeatStarter() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { goToSong, beatStarterOpen: open, setBeatStarterOpen, markBeatStarted } = useNavigation()
  const { busy, error, startBeat, regenerateLayers, hearBeat, newChords } = useGroove()
  const [choice, setChoice] = useState<string | null>(null)
  const [pendingStyle, setPendingStyle] = useState<{ style: StyleDef; surprise: boolean } | null>(null)
  const [pendingShuffle, setPendingShuffle] = useState<BankKind | null>(null)
  const [notice, setNotice] = useState('')
  const pattern = state.patterns.find((item) => item.id === state.activePatternId)
  const locked = pattern?.variationLocks ?? []
  const unlocked = BANK_KINDS.filter((kind) => !locked.includes(kind))
  const hasSteps = state.banks.some((bank) => bankHasSteps(state, bank))
  const live = (kind: BankKind) => !!state.groove?.layers[kind] && bankHasSteps(state, getBank(state, kind))
  const liveStyles = [...new Set(BANK_KINDS.filter(live).map((kind) => state.groove!.layers[kind]!.styleId))]
  // The menu shows what Generate will use: your pick, else the beat's style, else each part's own, else Surprise.
  const value = choice ?? (liveStyles.length === 1 ? liveStyles[0]! : liveStyles.length > 1 ? OWN : SURPRISE)
  const editingSection =
    state.transport.auditionScope === 'loop' ? state.songSections.find((section) => section.id === state.transport.auditionSectionId) : undefined

  /** Back to playing the whole song — the section loop (and its "Working on" note) ends. */
  const endLoop = () => {
    engine.setSequencerPlaybackEnabled(false)
    dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: false })
    dispatch({ type: 'SET_PLAY_MODE', mode: 'song' })
  }

  const toggleLock = (kind: BankKind) =>
    dispatch({ type: 'SET_VARIATION_LOCKS', locked: locked.includes(kind) ? locked.filter((item) => item !== kind) : BANK_KINDS.filter((item) => item === kind || locked.includes(item)) })

  /** Writing `style` over the unlocked parts would replace something already there in another style (or steps you drew) — empty parts don't count. */
  const replaces = (style: StyleDef | null) =>
    style !== null && unlocked.some((kind) => bankHasSteps(state, getBank(state, kind)) && state.groove?.layers[kind]?.styleId !== style.id)

  const run = async (style: StyleDef | null, surprise: boolean) => {
    setPendingStyle(null)
    setNotice('')
    engine.getContext() // unlock audio on the gesture, before the instruments render
    const current = (kind: BankKind) => styleById(state.groove?.layers[kind]?.styleId ?? '')
    const changed = replaces(style)
    const whole = unlocked.length === BANK_KINDS.length && (!hasSteps || !state.groove || changed)
    const fallback = style ?? randomStyle(surprise ? liveStyles : [])
    const ok = whole
      ? await startBeat(fallback, { kinds: unlocked, keepSounds: !changed && hasSteps })
      : await regenerateLayers(unlocked, (kind) => style ?? current(kind) ?? fallback, { newSounds: changed })
    if (!ok) return
    setChoice(null)
    if (surprise) setNotice(`Surprise: ${fallback.name}`)
    if (whole) markBeatStarted()
    hearBeat()
  }

  const generate = () => {
    if (unlocked.length === 0) return
    const surprise = value === SURPRISE
    const style = value === OWN ? null : surprise ? randomStyle(liveStyles) : styleById(value) ?? null
    if (style && unlocked.length === BANK_KINDS.length && replaces(style)) setPendingStyle({ style, surprise })
    else void run(style, surprise)
  }

  /**
   * A new take of one instrument, everything else untouched: the part's own
   * style, sounds, Busy and Keys / Kit stay; a part with nothing yet is
   * written in the menu's style (else the beat's, else a random one).
   */
  const shuffle = async (kind: BankKind) => {
    setPendingShuffle(null)
    setNotice('')
    engine.getContext() // unlock audio on the gesture, before the instrument renders
    const own = styleById(state.groove?.layers[kind]?.styleId ?? '')
    const picked = value === SURPRISE || value === OWN ? undefined : styleById(value)
    const style = own ?? picked ?? styleById(liveStyles[0] ?? '') ?? randomStyle()
    const ok = await regenerateLayers([kind], () => style)
    if (ok) hearBeat()
  }

  /** Steps you drew yourself aren't a generated part — shuffling replaces them, so it asks first. */
  const askShuffle = (kind: BankKind) => {
    if (bankHasSteps(state, getBank(state, kind)) && !state.groove?.layers[kind]) setPendingShuffle(kind)
    else void shuffle(kind)
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

  // Generate shows Building… for a whole beat or several parts; a single part's shuffle is quick and shows on its own button.
  const building = busy?.startsWith('start:') || (busy?.startsWith('layers:') && busy.includes('+'))

  return (
    <section className={open ? 'module beat-starter' : 'module beat-starter folded'} aria-label="Make a beat">
      {editingSection && (
        <div className="beat-edit-context" role="status">
          <div className="beat-edit-text">
            <strong>Working on {editingSection.name}</strong>
            <span>{state.transport.isPlaying ? 'Looping it now.' : 'Play loops it.'} Make a beat and the pads change this section.</span>
          </div>
          <div className="beat-edit-actions">
            <button type="button" className="chip-btn" onClick={endLoop}>
              End loop
            </button>
            <button type="button" className="chip-btn" onClick={goToSong}>
              Song page
            </button>
          </div>
        </div>
      )}
      <header className="module-head">
        <button type="button" className="beat-fold" aria-expanded={open} onClick={() => setBeatStarterOpen((isOpen) => !isOpen)} aria-label={open ? 'Hide Make a beat' : 'Show Make a beat'}>
          <h2 className="module-title">Make a beat</h2>
          <span className="beat-fold-chevron" aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
      </header>
      {open && <>
      <div className="beat-main">
        <select className="beat-style-all" value={value} onChange={(event) => setChoice(event.target.value)} disabled={busy !== null} aria-label="Style">
          <option value={SURPRISE}>🎲 Surprise me</option>
          {liveStyles.length > 1 && <option value={OWN}>Each part's own style</option>}
          {STYLES.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary beat-generate" disabled={busy !== null || unlocked.length === 0} onClick={generate}>
          <DiceIcon size={16} />
          {building ? 'Building…' : 'Generate'}
        </button>
      </div>
      <div className="beat-parts" role="group" aria-label="Parts — shuffle one instrument, or lock it so Generate leaves it alone">
        {BANK_KINDS.map((kind) => {
          const isLocked = locked.includes(kind)
          const shuffling = busy === `layers:${kind}`
          return (
            <div key={kind} className={isLocked ? 'beat-part locked' : live(kind) ? 'beat-part on' : 'beat-part'}>
              <button
                type="button"
                className="beat-part-shuffle"
                disabled={busy !== null || isLocked}
                aria-label={`Shuffle ${BANK_NAMES[kind]}`}
                title={isLocked ? `${BANK_NAMES[kind]} is locked — unlock it to shuffle` : `New pattern for ${BANK_NAMES[kind]} only`}
                onClick={() => askShuffle(kind)}
              >
                <DiceIcon size={14} />
                {shuffling ? 'Building…' : BANK_NAMES[kind]}
              </button>
              <button
                type="button"
                className="beat-part-lock"
                aria-pressed={isLocked}
                aria-label={`Lock ${BANK_NAMES[kind]}`}
                title={isLocked ? `${BANK_NAMES[kind]} is kept — tap to let Generate change it` : `Tap to keep ${BANK_NAMES[kind]} as it is`}
                onClick={() => toggleLock(kind)}
              >
                <LockIcon size={14} open={!isLocked} />
              </button>
            </div>
          )
        })}
      </div>
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
          {state.groove && (
            <button
              type="button"
              className="chip-btn"
              onClick={() => void newChords()}
              disabled={busy !== null}
              aria-label="New chords"
              title={`Chords now: ${progressionNames(state.key, state.groove.progression).join(' · ')} — every style layer follows a new progression`}
            >
              New chords
            </button>
          )}
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
      {pendingShuffle && (
        <ConfirmDialog
          message={`Replace the ${BANK_NAMES[pendingShuffle]} steps you made with a new generated pattern? Song parts using this pattern change too.`}
          confirmLabel="Replace"
          onConfirm={() => void shuffle(pendingShuffle)}
          onCancel={() => setPendingShuffle(null)}
        />
      )}
      {pendingStyle && (
        <ConfirmDialog
          message={`Start a whole new ${pendingStyle.style.name} beat in ${pattern?.name ?? 'this pattern'}? It replaces every part, the chords and the tempo — lock a part first to keep it. Song parts using this pattern change too.`}
          confirmLabel="Start"
          onConfirm={() => void run(pendingStyle.style, pendingStyle.surprise)}
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
