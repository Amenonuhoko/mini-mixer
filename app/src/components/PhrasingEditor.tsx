import { bankPhrasing } from '../engine/phrasing'
import { useAppState } from '../state/AppStateContext'
import { BANK_NAMES } from '../state/banks'
import type { Bank, Pattern, Phrasing } from '../state/types'
import { Overlay } from './Overlay'

const ARTICULATIONS = [
  { id: 'natural', label: 'Original', hint: 'Play the complete recording.' },
  { id: 'short', label: 'Short', hint: 'Brief stabs with space between them.' },
  { id: 'detached', label: 'Detached', hint: 'Clear attacks and a small gap before the next note.' },
  { id: 'connected', label: 'Connected', hint: 'Hold toward the next note with softer edges.' },
] as const

export function PhrasingEditor({ bank, pattern, onClose }: { bank: Bank; pattern: Pattern; onClose: () => void }) {
  const { state, dispatch } = useAppState()
  const settings = bankPhrasing(pattern, bank)
  const change = (patch: Partial<Phrasing>) => dispatch({ type: 'PREVIEW_PATTERN_PHRASING', patternId: pattern.id, bank: bank.kind, phrasing: { ...settings, ...patch } })
  const undo = () => { dispatch({ type: 'UNDO_VARIATION' }); onClose() }
  const linked = state.songSections.filter((section) => section.patternId === pattern.id).length > 1
  return <Overlay title={`${BANK_NAMES[bank.kind]} phrasing`} subtitle={`For ${pattern.name}. Hear changes while the pattern loops.`} onClose={undo}>
    <section className="sheet-section phrasing-editor">
      <div className="phrasing-choices" role="group" aria-label="Articulation">
        {ARTICULATIONS.map((item) => <button key={item.id} type="button" className={`choice${settings.articulation === item.id ? ' on' : ''}`} aria-pressed={settings.articulation === item.id} onClick={() => change({ articulation: item.id })}>
          <strong>{item.label}</strong><small>{item.hint}</small>
        </button>)}
      </div>
      <label className="settings-row">Maximum note length
        <select aria-label="Maximum note length" disabled={settings.articulation === 'natural'} value={settings.lengthSteps} onChange={(event) => change({ lengthSteps: Number(event.target.value) })}>
          <option value={0}>Follow phrase · up to 2 beats</option>
          <option value={1}>1/16 note</option><option value={2}>1/8 note</option>
          <option value={4}>1 beat</option><option value={8}>2 beats</option><option value={16}>1 bar</option>
        </select>
      </label>
      <label>Dynamics · {settings.dynamics === 0 ? 'Even' : `${settings.dynamics}%`}
        <input type="range" aria-label="Phrasing dynamics" min={0} max={100} step={5} value={settings.dynamics} onChange={(event) => change({ dynamics: Number(event.target.value) })} />
      </label>
      <p className="muted sheet-note">Dynamics add beat accents and subtle changes in loudness. Notes end before the next onset or phrase boundary, and never outlast the recording. Connected notes still have their recorded attacks.</p>
      {linked && <p className="muted sheet-note">This pattern is shared by several song sections. Make a section unique in Song to give it different phrasing.</p>}
      <div className="sheet-actions">
        <button className="btn" type="button" onClick={() => {
          if (state.transport.isPlaying) dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: false })
          else { dispatch({ type: 'SET_PLAY_MODE', mode: 'pattern' }); dispatch({ type: 'SET_LOOP_MODE', loopMode: 'continuous' }); dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: true }) }
        }}>{state.transport.isPlaying ? 'Stop' : 'Hear pattern'}</button>
        <button className="btn" type="button" onClick={undo}>Undo</button>
        <button className="btn primary" type="button" onClick={() => { dispatch({ type: 'KEEP_VARIATION' }); onClose() }}>Keep</button>
      </div>
    </section>
  </Overlay>
}
