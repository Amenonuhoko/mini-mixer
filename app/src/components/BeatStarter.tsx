import { useState } from 'react'
import { bankHasSteps, useGroove } from '../hooks/useGroove'
import { useAppState } from '../state/AppStateContext'
import { useNavigation } from '../state/NavigationContext'
import { useEngine } from '../state/EngineContext'
import { BANK_KINDS, BANK_NAMES } from '../state/banks'
import type { BankKind } from '../state/types'
import { STYLES } from '../styles/library'
import { newSeed } from '../styles/random'
import type { StyleDef } from '../styles/types'
import { VARIATIONS, varyPattern, type VariationKind } from '../styles/variations'
import { ConfirmDialog } from './ConfirmDialog'
import { DiceIcon } from './icons'

const LEVELS = [
  { name: 'Simple', value: 0.1 },
  { name: 'Balanced', value: 0.5 },
  { name: 'Complex', value: 0.9 },
]

/** The style list's first choice: a different random style on every press. */
const SURPRISE = 'surprise'

/**
 * Make a beat, at the top of the sequencer: pick the parts, press Generate.
 * Every part picked gets fresh, randomly generated material (from the chosen
 * style, or a random one) and every part left out stays exactly as it is —
 * all four on a beat is a whole new beat. Press again for another take. The
 * Tweak row reshapes just the picked parts of what's there (sparser, busier,
 * a fill…), auditioned with Keep / Undo.
 */
export function BeatStarter() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { goToSong } = useNavigation()
  const { busy, error, startBeat, regenerateLayers, hearBeat } = useGroove()
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
    <section className="module beat-starter" aria-label="Make a beat">
      {editingSection && (
        <div className="beat-edit-context">
          <strong>Editing {editingSection.name} · section loops</strong>
          <button type="button" className="chip-btn" onClick={goToSong}>
            Back to song
          </button>
        </div>
      )}
      <header className="module-head">
        <h2 className="module-title">Make a beat</h2>
        <span className="module-sub">{whole ? 'a whole new beat' : 'only the parts picked — the rest stays'}</span>
        <button
          type="button"
          className={optionsOpen ? 'chip-btn on beat-options-toggle' : 'chip-btn beat-options-toggle'}
          aria-expanded={optionsOpen}
          onClick={() => setOptionsOpen((open) => !open)}
        >
          Options {optionsOpen ? '▴' : '▾'}
        </button>
      </header>
      <div className="beat-parts" role="group" aria-label="Parts to generate">
        {BANK_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={kinds.includes(kind) ? 'chip-btn on' : 'chip-btn'}
            aria-pressed={kinds.includes(kind)}
            onClick={() => toggleKind(kind)}
            disabled={busy !== null}
          >
            {BANK_NAMES[kind]}
          </button>
        ))}
      </div>
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
        {busy?.startsWith('start:') || busy?.startsWith('layers:') ? 'Building…' : hasSteps ? 'Generate again' : 'Generate'}
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
