import { useBankBuilder } from '../hooks/useBankBuilder'
import { keyName, keyShortName, MOODS, pitchName, SCALE_IDS, SCALES, type Mood, type MusicalKey } from '../music/theory'
import { useAppState } from '../state/AppStateContext'
import { Overlay } from './Overlay'

interface KeySheetProps {
  onClose: () => void
}

/**
 * Mood first, key under the hood: picking a mood sets the project key that
 * every melodic bank is laid out in, so the pads only offer notes and chords
 * that fit. Musicians can open "Pick the key yourself" to set the home note,
 * scale and chord color directly. Either way the melodic banks re-render and
 * programmed steps move with them.
 */
export function KeySheet({ onClose }: KeySheetProps) {
  const { state } = useAppState()
  const { busy, error, setKey } = useBankBuilder()
  const { key, mood } = state

  const pickMood = async (choice: Mood) => {
    await setKey(choice.key, choice.id, choice.id)
    onClose()
  }

  const tweak = (change: Partial<MusicalKey>, label: string) => void setKey({ ...key, ...change }, null, label)

  return (
    <Overlay onClose={onClose} title="Mood" subtitle="Pick a feel — the pads will only offer notes and chords that fit it.">
      {error && <p className="sheet-error" role="alert">{error}</p>}
      <ul className="choice-grid mood-grid">
        {MOODS.map((choice) => (
          <li key={choice.id}>
            <button
              type="button"
              className={mood === choice.id ? 'choice mood on' : 'choice mood'}
              onClick={() => void pickMood(choice)}
              disabled={busy !== null}
              aria-pressed={mood === choice.id}
            >
              <span className="choice-name">{busy === choice.id ? 'Tuning…' : choice.name}</span>
              <span className="mood-blurb">{choice.blurb}</span>
              <span className="mood-key readout">{keyShortName(choice.key)}</span>
            </button>
          </li>
        ))}
      </ul>

      <details className="sheet-section key-advanced" open={mood === null}>
        <summary className="label">Pick the key yourself · {keyName(key)}</summary>
        <h3 className="label">Home note</h3>
        <div className="key-notes" role="radiogroup" aria-label="Home note">
          {Array.from({ length: 12 }, (_, pc) => (
            <button
              key={pc}
              type="button"
              role="radio"
              aria-checked={key.tonic === pc}
              className={key.tonic === pc ? 'chip-btn on' : 'chip-btn'}
              disabled={busy !== null}
              onClick={() => tweak({ tonic: pc }, `tonic:${pc}`)}
            >
              {pitchName(pc, { ...key, tonic: pc })}
            </button>
          ))}
        </div>
        <h3 className="label">Scale</h3>
        <div className="key-scales" role="radiogroup" aria-label="Scale">
          {SCALE_IDS.map((scale) => (
            <button
              key={scale}
              type="button"
              role="radio"
              aria-checked={key.scale === scale}
              className={key.scale === scale ? 'chip-btn on' : 'chip-btn'}
              disabled={busy !== null}
              onClick={() => tweak({ scale }, `scale:${scale}`)}
            >
              {SCALES[scale].name}
            </button>
          ))}
        </div>
        <h3 className="label">Chords</h3>
        <div className="segmented" role="radiogroup" aria-label="Chord color">
          {(['triad', 'seventh'] as const).map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={key.chordColor === color}
              className={key.chordColor === color ? 'segment on' : 'segment'}
              disabled={busy !== null}
              onClick={() => tweak({ chordColor: color }, `color:${color}`)}
            >
              {color === 'triad' ? 'Simple' : 'Rich (7ths)'}
            </button>
          ))}
        </div>
        {busy && !MOODS.some((choice) => choice.id === busy) && <p className="muted sheet-note">Retuning pads…</p>}
      </details>
    </Overlay>
  )
}
