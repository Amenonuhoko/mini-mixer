import { VariationPanel } from './VariationPanel'
import { useState } from 'react'
import { bankHasSteps, useGroove } from '../hooks/useGroove'
import { useAppState } from '../state/AppStateContext'
import { useNavigation } from '../state/NavigationContext'
import { useEngine } from '../state/EngineContext'
import { BANK_KINDS, BANK_NAMES } from '../state/banks'
import type { BankKind } from '../state/types'
import { STYLES } from '../styles/library'
import { ConfirmDialog } from './ConfirmDialog'

const LEVELS = [
  { name: 'Simple', value: 0.1 },
  { name: 'Balanced', value: 0.5 },
  { name: 'Complex', value: 0.9 },
]

/** The complete starting path stays visible; per-layer editing is optional. */
export function BeatStarter() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const { goToSong } = useNavigation()
  const { busy, error, startBeat, hearBeat } = useGroove()
  const [styleId, setStyleId] = useState(state.groove?.layers.drums?.styleId ?? 'house')
  const [intensity, setIntensity] = useState(Object.values(state.groove?.layers ?? {})[0]?.intensity ?? 0.5)
  const [bars, setBars] = useState<1 | 2 | 4>((state.groove?.bars as 1 | 2 | 4) ?? 2)
  const [kinds, setKinds] = useState<BankKind[]>([...BANK_KINDS])
  const [keepSounds, setKeepSounds] = useState(true)
  const [confirm, setConfirm] = useState(false)
  const [collapsed, setCollapsed] = useState(() => state.banks.some((bank) => bankHasSteps(state, bank)))
  const style = STYLES.find((item) => item.id === styleId) ?? STYLES[0]!
  const hasSteps = state.banks.some((bank) => bankHasSteps(state, bank))
  const pattern = state.patterns.find((item) => item.id === state.activePatternId)
  const create = async () => {
    setConfirm(false)
    // Unlock audio on the gesture, before asynchronous instrument rendering.
    engine.getContext()
    const ok = await startBeat(style, { intensity, bars, kinds, keepSounds })
    if (ok) {
      hearBeat()
      setCollapsed(true)
    }
  }
  const stop = () => {
    engine.setSequencerPlaybackEnabled(false)
    engine.stopAllSounds()
    dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: false })
  }
  return (
    <section className="module beat-starter" aria-label="Make a beat">
      {state.transport.auditionScope === 'loop' && state.transport.auditionSectionId && <div className="beat-edit-context"><strong>Editing {state.songSections.find((section) => section.id === state.transport.auditionSectionId)?.name} · section loops</strong><button type="button" className="chip-btn" onClick={goToSong}>Back to song</button></div>}
      <div className="beat-starter-heading">
        <div>
          <h2 className="module-title">Make a beat</h2>
          <p className="muted">
            {collapsed
              ? 'Choose a preset or try another variation.'
              : 'Pick a style, choose how busy, then hear it together.'}
          </p>
        </div>
        <span className="chip">{pattern?.name}</span>
      </div>
      <button
        type="button"
        className="chip-btn beat-expand"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((value) => !value)}
      >
        {collapsed ? 'Choose beat preset' : 'Hide preset controls'}
      </button>
      {!collapsed && (
        <>
          <label className="beat-style-label">
            Style
            <select value={style.id} onChange={(event) => setStyleId(event.target.value)} disabled={busy !== null}>
              {STYLES.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name} · {item.bpm[0]}–{item.bpm[1]} BPM
                </option>
              ))}
            </select>
          </label>
          <p className="beat-style-description">{style.blurb}</p>
          <div className="beat-options" role="group" aria-label="Beat complexity">
            {LEVELS.map((level) => (
              <button
                type="button"
                key={level.name}
                className={intensity === level.value ? 'chip-btn on' : 'chip-btn'}
                aria-pressed={intensity === level.value}
                onClick={() => setIntensity(level.value)}
                disabled={busy !== null}
              >
                {level.name}
              </button>
            ))}
            <label>
              Length{' '}
              <select
                aria-label="Beat length"
                value={bars}
                onChange={(event) => setBars(Number(event.target.value) as 1 | 2 | 4)}
                disabled={busy !== null}
              >
                {[1, 2, 4].map((length) => (
                  <option key={length} value={length}>
                    {length} {length === 1 ? 'bar' : 'bars'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="beat-options" role="group" aria-label="Instruments in the beat">
            {BANK_KINDS.map((kind) => (
              <label key={kind}>
                <input
                  type="checkbox"
                  checked={kinds.includes(kind)}
                  disabled={busy !== null}
                  onChange={() =>
                    setKinds((current) =>
                      current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind],
                    )
                  }
                />
                {BANK_NAMES[kind]}
              </label>
            ))}
          </div>
          <label className="beat-keep-sounds">
            <input
              type="checkbox"
              checked={keepSounds}
              onChange={(event) => setKeepSounds(event.target.checked)}
              disabled={busy !== null}
            />
            Keep my current instruments and key
          </label>
        </>
      )}
      <div className="beat-actions">
        {!collapsed && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy !== null || kinds.length === 0}
            onClick={() => (hasSteps ? setConfirm(true) : void create())}
          >
            {busy?.startsWith('start:') ? 'Building sounds…' : 'Generate & play'}
          </button>
        )}
        <button
          type="button"
          className="btn"
          disabled={!hasSteps || busy !== null}
          onClick={state.transport.isPlaying ? stop : hearBeat}
        >
          {state.transport.isPlaying ? 'Stop' : 'Hear beat'}
        </button>
      </div>
      {!collapsed && (
        <p className="muted beat-hint">
          Develop this beat below to lock parts and audition variations. Fine-tune individual layers
          in the sequencer.
        </p>
      )}
      {hasSteps && <VariationPanel />}
      {error && (
        <p className="sheet-error" role="alert">
          {error}
        </p>
      )}
      {confirm && (
        <ConfirmDialog
          message={`Replace the notes in ${pattern?.name ?? 'this pattern'} with a ${style.name} beat? Song parts using this pattern will change too.${keepSounds ? '' : ' Instruments and key will also change across the song.'}`}
          confirmLabel="Generate & play"
          onConfirm={() => void create()}
          onCancel={() => setConfirm(false)}
        />
      )}
    </section>
  )
}
