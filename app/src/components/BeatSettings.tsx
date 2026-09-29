import { useState } from 'react'
import { bankHasSteps, beatStyle, useGroove } from '../hooks/useGroove'
import { keyName, MOODS } from '../music/theory'
import { useAppState } from '../state/AppStateContext'
import { BANK_KINDS, BANK_NAMES, getBank } from '../state/banks'
import type { BankKind } from '../state/types'
import { beatBpm, progressionNames } from '../styles/generator'
import { newSeed } from '../styles/random'
import { ConfirmDialog } from './ConfirmDialog'
import { CloseIcon, DiceIcon } from './icons'
import { KeySheet } from './KeySheet'
import { TempoControl } from './TempoControl'

const LENGTHS = [1, 2, 4] as const

/**
 * The beat as a whole, everything Generate decides for you and more: tempo
 * (with the style's own range), length in bars, mood and key, the chord
 * progression (a chosen one or a new one), Busy and Keys / Kit for every
 * unlocked part at once, and clearing them. Each part's own settings are on
 * its ⋯ above.
 */
export function BeatSettings({ locked, hear }: { locked: BankKind[]; hear: () => void }) {
  const { state, dispatch } = useAppState()
  const { busy, newChords, setChords, setLength, setIntensityFor, setRangeFor, clearLayers } = useGroove()
  const [keySheet, setKeySheet] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const groove = state.groove
  const style = groove ? beatStyle(groove) : null
  const live = (kind: BankKind) => !!groove?.layers[kind] && bankHasSteps(state, getBank(state, kind))
  const liveUnlocked = BANK_KINDS.filter((kind) => !locked.includes(kind) && live(kind))
  const handDrawn = BANK_KINDS.some((kind) => bankHasSteps(state, getBank(state, kind)) && !groove?.layers[kind])
  const lengthBlocked = !groove ? 'Generate a beat first' : locked.some(live) ? 'Unlock every part to change the length' : handDrawn ? "Steps you drew would be lost — the length is for a generated beat" : ''
  const mean = (read: (kind: BankKind) => number) => Math.round((liveUnlocked.reduce((sum, kind) => sum + read(kind), 0) / Math.max(1, liveUnlocked.length)) * 100)
  const intensity = liveUnlocked.length ? mean((kind) => groove!.layers[kind]!.intensity) : 50
  const range = liveUnlocked.length ? mean((kind) => groove!.layers[kind]!.range ?? 0) : 0
  const progressions = style?.progressions ?? []
  const chosen = groove ? progressions.findIndex((item) => item.join() === groove.progression.join()) : -1
  const mood = MOODS.find((item) => item.id === state.mood)

  const heardIfStopped = () => { if (!state.transport.isPlaying) hear() }
  const changeLength = async (bars: 1 | 2 | 4) => { if (await setLength(bars)) hear() }

  return (
    <div className="beat-settings">
      <div className="beat-row">
        <span className="label">Tempo</span>
        <div className="beat-row-control">
          <TempoControl bpm={state.transport.bpm} onChange={(bpm) => dispatch({ type: 'SET_BPM', bpm })} />
          {style && (
            <button
              type="button"
              className="chip-btn"
              onClick={() => dispatch({ type: 'SET_BPM', bpm: beatBpm(style, newSeed()) })}
              aria-label={`New tempo in ${style.name}'s range, ${style.bpm[0]} to ${style.bpm[1]}`}
              title={`A new tempo inside ${style.name}'s range`}
            >
              <DiceIcon size={14} /> {style.bpm[0]}–{style.bpm[1]}
            </button>
          )}
        </div>
      </div>
      <div className="beat-row">
        <span className="label">Length</span>
        <div className="beat-row-control" role="group" aria-label="Length in bars" title={lengthBlocked}>
          {LENGTHS.map((bars) => (
            <button
              key={bars}
              type="button"
              className={groove?.bars === bars ? 'chip-btn on' : 'chip-btn'}
              aria-pressed={groove?.bars === bars}
              disabled={busy !== null || lengthBlocked !== ''}
              onClick={() => void changeLength(bars)}
            >
              {bars} {bars === 1 ? 'bar' : 'bars'}
            </button>
          ))}
        </div>
      </div>
      <div className="beat-row">
        <span className="label">Mood</span>
        <div className="beat-row-control">
          <button type="button" className="chip-btn" onClick={() => setKeySheet(true)} aria-label="Mood and key" title="Mood, key of a song, or pick the key yourself">
            {mood ? `${mood.name} · ` : ''}{keyName(state.key)}
          </button>
        </div>
      </div>
      <div className="beat-row">
        <span className="label">Chords</span>
        <div className="beat-row-control">
          <select
            className="beat-progression"
            aria-label="Chord progression"
            disabled={!groove || busy !== null}
            value={chosen >= 0 ? String(chosen) : 'custom'}
            onChange={(event) => { const next = progressions[Number(event.target.value)]; if (next) void setChords(next).then(heardIfStopped) }}
          >
            {chosen < 0 && <option value="custom" disabled>{groove ? progressionNames(state.key, groove.progression).join(' · ') : 'No beat yet'}</option>}
            {progressions.map((item, index) => <option key={item.join()} value={index}>{progressionNames(state.key, item).join(' · ')}</option>)}
          </select>
          <button
            type="button"
            className="chip-btn"
            onClick={() => void newChords().then(heardIfStopped)}
            disabled={!groove || busy !== null}
            aria-label="New chords"
            title="A different progression — every style layer follows it"
          >
            New chords
          </button>
        </div>
      </div>
      <label className="part-sheet-slider">
        <span className="label">Busy, all parts <span className="muted">· sparse ↔ busy</span></span>
        <input
          type="range"
          className="slider"
          style={{ '--fill': `${intensity / 100}` } as React.CSSProperties}
          min="0"
          max="100"
          step="5"
          value={intensity}
          disabled={liveUnlocked.length === 0 || busy !== null}
          onChange={(event) => setIntensityFor(liveUnlocked, Number(event.target.value) / 100)}
          aria-label="Busy, every unlocked part"
        />
      </label>
      <label className="part-sheet-slider">
        <span className="label">Keys / Kit, all parts <span className="muted">· the style's own ↔ everything</span></span>
        <input
          type="range"
          className="slider"
          style={{ '--fill': `${range / 100}` } as React.CSSProperties}
          min="0"
          max="100"
          step="5"
          value={range}
          disabled={liveUnlocked.length === 0 || busy !== null}
          onChange={(event) => setRangeFor(liveUnlocked, Number(event.target.value) / 100)}
          aria-label="Keys and kit range, every unlocked part"
        />
      </label>
      <div className="beat-row">
        <span className="label">Clear</span>
        <div className="beat-row-control">
          <button type="button" className="chip-btn danger" onClick={() => setConfirmClear(true)} disabled={busy !== null || BANK_KINDS.every((kind) => locked.includes(kind) || !bankHasSteps(state, getBank(state, kind)))}>
            <CloseIcon size={12} /> Unlocked parts
          </button>
        </div>
      </div>
      {keySheet && <KeySheet onClose={() => setKeySheet(false)} />}
      {confirmClear && (
        <ConfirmDialog
          message={`Clear ${BANK_KINDS.filter((kind) => !locked.includes(kind)).map((kind) => BANK_NAMES[kind]).join(', ')} from ${state.patterns.find((item) => item.id === state.activePatternId)?.name ?? 'this pattern'}? Song parts using this pattern change too.`}
          confirmLabel="Clear"
          onConfirm={() => { setConfirmClear(false); clearLayers(BANK_KINDS.filter((kind) => !locked.includes(kind))) }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  )
}
