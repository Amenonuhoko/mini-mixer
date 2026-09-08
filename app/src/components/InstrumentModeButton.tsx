import { useState } from 'react'
import { buildDrumKitKeys, DRUM_KIT_VOICES } from '../engine/drumSynth'
import { buildInstrumentKeysFromPreset, INSTRUMENT_PRESETS, type InstrumentPreset } from '../engine/synth'
import { useAppState } from '../state/AppStateContext'
import { createId } from '../state/defaults'
import { buildKeySamples } from '../utils/buildInstrumentSamples'
import { instrumentIcon, instrumentIconForName } from '../utils/instrumentIcon'
import type { Instrument } from '../state/types'
import { Overlay } from './Overlay'

/** A quick-build choice offered by this button's picker: a pitched synth preset, or the fixed Drum Kit (which has no InstrumentPreset shape of its own — see engine/drumSynth.ts). */
type PresetChoice = InstrumentPreset | 'drum-kit'

type PendingChoice =
  | { kind: 'existing'; instrumentId: string }
  | { kind: 'preset'; preset: PresetChoice }

/**
 * Dedicated icon button for Instrument Mode, top-right of the Pads panel
 * header alongside LoopModeSwitch and PadEffectsMenuButton — pulled out of
 * GridModeButton's menu since, like Loop Mode before it, it's reached for
 * often enough that a two-tap "open menu, then pick Instrument Mode" was more
 * friction than it deserved. Unlike Loop Mode's switch this isn't a bare
 * on/off flip: turning it on always has to ask "which instrument?" first
 * (there's no implicit "whatever was there before"), so tapping this while
 * off opens the instrument picker, while tapping it while on turns it off
 * directly — nothing left to ask at that point.
 *
 * Picking a quick preset here builds a brand-new instrument on the spot,
 * with no need to visit the Library first — this button is always usable
 * even with an empty library. Since that instrument only exists for this one
 * performance, turning Instrument Mode off removes it (and its generated key
 * samples) again, so quick experiments do not quietly pile up in project data.
 * The same cleanup also runs if another mutually exclusive grid mode turns
 * Instrument Mode off, or before a new quick instrument replaces the old one.
 * Older saved instruments remain selectable under "Your library" and are not
 * silently deleted.
 */
export function InstrumentModeButton() {
  const { state, dispatch } = useAppState()
  const enabled = state.transport.padInstrumentModeEnabled
  // The instrument this button itself most recently built, if any — see
  // Transport.autoInstrumentId for why this lives in app state rather than a
  // local useState (this component unmounts on every page switch, which
  // would otherwise lose track of what to clean up on the next "off").
  const autoInstrumentId = state.transport.autoInstrumentId
  const [pickingInstrument, setPickingInstrument] = useState(false)
  const [building, setBuilding] = useState<string | null>(null)
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null)

  const libraryInstruments = state.instrumentOrder
    .map((id) => state.instruments[id])
    .filter((instrument): instrument is Instrument => instrument !== undefined)
  const anyPadFilled = state.pads
    .slice(0, state.visiblePadCount)
    .some((pad) => pad.sampleId !== null)

  const closeAll = () => {
    setPickingInstrument(false)
    setPendingChoice(null)
  }

  const removeAutoInstrument = () => {
    if (autoInstrumentId) dispatch({ type: 'REMOVE_INSTRUMENT', instrumentId: autoInstrumentId })
  }

  const applyExisting = (instrumentId: string) => {
    removeAutoInstrument()
    dispatch({ type: 'APPLY_INSTRUMENT_TO_PADS', instrumentId })
    dispatch({ type: 'SET_PAD_INSTRUMENT_MODE_ENABLED', enabled: true })
    // Applying something you deliberately built (or a still-active quick
    // build you're choosing to keep by reselecting it) is never auto-removed.
    dispatch({ type: 'SET_AUTO_INSTRUMENT_ID', instrumentId: null })
    closeAll()
  }

  const buildAndApplyPreset = async (preset: PresetChoice) => {
    const name = preset === 'drum-kit' ? 'Drum Kit' : preset.name
    setBuilding(name)
    try {
      const buffers = preset === 'drum-kit' ? await buildDrumKitKeys() : await buildInstrumentKeysFromPreset(preset)
      const labels =
        preset === 'drum-kit'
          ? DRUM_KIT_VOICES.map((voice) => voice.name)
          : buffers.map((_, i) => `${name} ${i + 1}`)
      const keySamples = buildKeySamples(buffers, labels)
      const instrument: Instrument = {
        id: createId('instrument'),
        name,
        source: 'preset',
        keySampleIds: keySamples.map((s) => s.id),
      }
      removeAutoInstrument()
      dispatch({ type: 'ADD_INSTRUMENT', instrument, keySamples })
      dispatch({ type: 'APPLY_INSTRUMENT_TO_PADS', instrumentId: instrument.id })
      dispatch({ type: 'SET_PAD_INSTRUMENT_MODE_ENABLED', enabled: true })
      dispatch({ type: 'SET_AUTO_INSTRUMENT_ID', instrumentId: instrument.id })
      closeAll()
    } finally {
      setBuilding(null)
    }
  }

  const handlePickExisting = (instrumentId: string) => {
    if (anyPadFilled) setPendingChoice({ kind: 'existing', instrumentId })
    else applyExisting(instrumentId)
  }

  const handlePickPreset = (preset: PresetChoice) => {
    if (anyPadFilled) setPendingChoice({ kind: 'preset', preset })
    else void buildAndApplyPreset(preset)
  }

  const confirmPending = () => {
    if (!pendingChoice) return
    if (pendingChoice.kind === 'existing') applyExisting(pendingChoice.instrumentId)
    else void buildAndApplyPreset(pendingChoice.preset)
  }

  const handleClick = () => {
    if (enabled) {
      dispatch({ type: 'SET_PAD_INSTRUMENT_MODE_ENABLED', enabled: false })
      removeAutoInstrument()
    } else {
      setPickingInstrument(true)
    }
  }

  return (
    <>
      <button
        type="button"
        className={enabled ? 'instrument-mode-btn on' : 'instrument-mode-btn'}
        onClick={handleClick}
        aria-pressed={enabled}
        aria-label="Instrument Mode"
        title={
          enabled
            ? 'Instrument Mode is on — tap to turn off'
            : 'Instrument Mode — choose an instrument to lay across the pads'
        }
      >
        <PianoKeysIcon />
      </button>

      {pickingInstrument && (
        <Overlay onClose={closeAll}>
          <h2>Choose an instrument</h2>
          <p className="muted">Lays its keys across the pads — Pad 1 gets the lowest note.</p>

          <span className="settings-label">Quick presets</span>
          <ul className="instrument-picker-list">
            {INSTRUMENT_PRESETS.map((preset) => (
              <li key={preset.name}>
                <button
                  type="button"
                  className="btn btn-secondary instrument-picker-btn"
                  onClick={() => handlePickPreset(preset)}
                  disabled={building !== null}
                >
                  <span aria-hidden="true">{instrumentIconForName(preset.name)}</span>
                  {building === preset.name ? 'Building…' : preset.name}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                className="btn btn-secondary instrument-picker-btn"
                onClick={() => handlePickPreset('drum-kit')}
                disabled={building !== null}
              >
                <span aria-hidden="true">{instrumentIconForName('Drum Kit')}</span>
                {building === 'Drum Kit' ? 'Building…' : 'Drum Kit'}
              </button>
            </li>
          </ul>

          {libraryInstruments.length > 0 && (
            <>
              <span className="settings-label">Your library</span>
              <ul className="instrument-picker-list">
                {libraryInstruments.map((instrument) => (
                  <li key={instrument.id}>
                    <button
                      type="button"
                      className="btn btn-secondary instrument-picker-btn"
                      onClick={() => handlePickExisting(instrument.id)}
                      disabled={building !== null}
                    >
                      <span aria-hidden="true">{instrumentIcon(instrument)}</span>
                      {instrument.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {pendingChoice && (
            <div className="confirm-overwrite">
              <span>Replace every pad's current sound with this instrument?</span>
              <button type="button" className="btn btn-danger" onClick={confirmPending}>
                Apply
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setPendingChoice(null)}>
                Cancel
              </button>
            </div>
          )}

          <button type="button" className="btn btn-secondary overlay-close" onClick={closeAll}>
            Cancel
          </button>
        </Overlay>
      )}
    </>
  )
}

function PianoKeysIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 6v7M13 6v7M17 6v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
