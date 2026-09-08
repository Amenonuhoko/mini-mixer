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

/**
 * Dedicated icon button for Instrument Mode, top-right of the Pads panel
 * header alongside LoopModeSwitch and PadEffectsMenuButton — pulled out of
 * GridModeButton's menu since, like Loop Mode before it, it's reached for
 * often enough that a two-tap "open menu, then pick Instrument Mode" was more
 * friction than it deserved. Unlike Loop Mode's switch this isn't a bare
 * on/off flip: turning it on always has to ask "which instrument?" first
 * (there's no implicit "whatever was there before"), so tapping it always
 * opens the instrument picker. When an instrument is already active, that
 * makes replacement a single direct action without first clearing the pads.
 *
 * Picking a quick preset here builds a brand-new instrument on the spot,
 * with no need to visit the Library first — this button is always usable
 * even with an empty library. Since that instrument only exists for this one
 * performance, replacing it removes its generated key samples again, so quick
 * experiments do not quietly pile up in project data. Other grid modes leave
 * current pad sounds intact.
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

  const libraryInstruments = state.instrumentOrder
    .map((id) => state.instruments[id])
    .filter((instrument): instrument is Instrument => instrument !== undefined)

  const quickPresetGroups = [
    { label: 'Keys & tuned percussion', names: ['Piano', 'Organ', 'Bell'] },
    { label: 'Strings', names: ['Guitar', 'Pluck', 'Bass'] },
    { label: 'Synths', names: ['Lead', 'Pad'] },
  ].map(({ label, names }) => ({
    label,
    presets: names
      .map((name) => INSTRUMENT_PRESETS.find((preset) => preset.name === name))
      .filter((preset): preset is InstrumentPreset => preset !== undefined),
  }))
  const closeAll = () => {
    setPickingInstrument(false)
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
      // Snapshot every existing pad the instrument will expose, including
      // currently hidden slots, before its keys replace their assignments.
      const padSnapshot =
        state.transport.autoInstrumentPadSnapshot ??
        Object.fromEntries(
          state.pads.slice(0, Math.max(state.visiblePadCount, keySamples.length)).map((pad) => [
            pad.id,
            { sampleId: pad.sampleId, trimStart: pad.trimStart, trimEnd: pad.trimEnd },
          ]),
        )
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
      dispatch({ type: 'SET_AUTO_INSTRUMENT_ID', instrumentId: instrument.id, padSnapshot })
      closeAll()
    } finally {
      setBuilding(null)
    }
  }

  const handlePickExisting = (instrumentId: string) => {
    // Instrument selection is a direct replacement action: keep the current
    // layout until the new choice is ready, then apply it without a second prompt.
    applyExisting(instrumentId)
  }

  const handlePickPreset = (preset: PresetChoice) => {
    void buildAndApplyPreset(preset)
  }

  const handleClick = () => {
    setPickingInstrument(true)
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
            ? 'Instrument Mode is on — tap to replace the instrument'
            : 'Instrument Mode — choose an instrument to lay across the pads'
        }
      >
        <SoundLayoutIcon />
        <span className="instrument-mode-label">Instrument</span>
      </button>

      {pickingInstrument && (
        <Overlay onClose={closeAll}>
          <h2>Choose an instrument</h2>
          <p className="muted">Lays its keys across the pads — Pad 1 gets the lowest note.</p>

          <span className="settings-label">Quick presets</span>
          {quickPresetGroups.map(({ label, presets }) => (
            <section key={label} aria-label={label}>
              <span className="settings-label">{label}</span>
              <ul className="instrument-picker-list">
                {presets.map((preset) => (
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
              </ul>
            </section>
          ))}
          <span className="settings-label">Drums</span>
          <ul className="instrument-picker-list">
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


          <button type="button" className="btn btn-secondary overlay-close" onClick={closeAll}>
            Cancel
          </button>
        </Overlay>
      )}
    </>
  )
}

function SoundLayoutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M4 10v4h4l5 4V6L8 10H4z" fill="currentColor" />
      <path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
