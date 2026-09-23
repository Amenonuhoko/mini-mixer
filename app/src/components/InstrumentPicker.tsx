import { useState } from 'react'
import { buildDrumKitKeys, DRUM_KITS, type DrumKitPreset } from '../engine/drumSynth'
import { buildInstrumentKeysFromPreset, INSTRUMENT_PRESETS, type InstrumentPreset } from '../engine/synth'
import { useAppState } from '../state/AppStateContext'
import { createId } from '../state/defaults'
import type { Instrument } from '../state/types'
import { captureAutoInstrumentPadSnapshot } from '../utils/autoInstrumentSnapshot'
import { buildKeySamples } from '../utils/buildInstrumentSamples'
import { instrumentIconForName } from '../utils/instrumentIcon'
import { Overlay } from './Overlay'

/** A quick-build choice: a pitched synth preset, or a Drum Kit (which has no InstrumentPreset shape of its own — see engine/drumSynth.ts). */
type PresetChoice = InstrumentPreset | DrumKitPreset

const QUICK_PRESET_GROUPS = [
  { label: 'Keys', names: ['Piano', 'Organ', 'Bell'] },
  { label: 'Strings', names: ['Guitar', 'Pluck', 'Bass'] },
  { label: 'Synths', names: ['Lead', 'Pad'] },
].map(({ label, names }) => ({
  label,
  presets: names
    .map((name) => INSTRUMENT_PRESETS.find((preset) => preset.name === name))
    .filter((preset): preset is InstrumentPreset => preset !== undefined),
}))

interface InstrumentPickerProps {
  onClose: () => void
}

/**
 * The KEYS mode's "which instrument?" sheet (opened from PadModeSwitch).
 * Turning KEYS on always asks first — there's no implicit "whatever was there
 * before" — and when an instrument is already active, picking another is a
 * single direct replacement.
 *
 * Picking a preset builds a brand-new instrument on the spot, with no need to
 * visit the Library first, so KEYS is usable even with an empty library.
 * Since that instrument only exists for this one performance, replacing it
 * removes its generated key samples again (see Transport.autoInstrumentId),
 * so quick experiments don't quietly pile up in project data.
 */
export function InstrumentPicker({ onClose }: InstrumentPickerProps) {
  const { state, dispatch } = useAppState()
  const autoInstrumentId = state.transport.autoInstrumentId
  const [building, setBuilding] = useState<string | null>(null)

  const buildAndApplyPreset = async (preset: PresetChoice) => {
    const name = preset.name
    setBuilding(name)
    try {
      const buffers = 'id' in preset ? await buildDrumKitKeys(preset.id) : await buildInstrumentKeysFromPreset(preset)
      const labels =
        'id' in preset ? preset.voices.map((voice) => voice.name) : buffers.map((_, i) => `${name} ${i + 1}`)
      const keySamples = buildKeySamples(buffers, labels)
      // Snapshot every existing pad the instrument will expose, including
      // currently hidden slots, before its keys replace their assignments.
      const padSnapshot = captureAutoInstrumentPadSnapshot(state, keySamples.length)
      const instrument: Instrument = {
        id: createId('instrument'),
        name,
        source: 'preset',
        keySampleIds: keySamples.map((s) => s.id),
      }
      if (autoInstrumentId) dispatch({ type: 'REMOVE_INSTRUMENT', instrumentId: autoInstrumentId })
      dispatch({ type: 'ADD_INSTRUMENT', instrument, keySamples })
      dispatch({ type: 'APPLY_INSTRUMENT_TO_PADS', instrumentId: instrument.id })
      dispatch({ type: 'SET_PAD_INSTRUMENT_MODE_ENABLED', enabled: true })
      dispatch({ type: 'SET_AUTO_INSTRUMENT_ID', instrumentId: instrument.id, padSnapshot })
      onClose()
    } finally {
      setBuilding(null)
    }
  }

  const renderChoice = (preset: PresetChoice) => (
    <li key={preset.name}>
      <button
        type="button"
        className="choice"
        onClick={() => void buildAndApplyPreset(preset)}
        disabled={building !== null}
      >
        <span className="choice-icon" aria-hidden="true">{instrumentIconForName(preset.name)}</span>
        <span className="choice-name">{building === preset.name ? 'Building…' : preset.name}</span>
      </button>
    </li>
  )

  return (
    <Overlay onClose={onClose} title="Keys" subtitle="Lays an instrument across the pads — pad 1 is the lowest note.">
      {QUICK_PRESET_GROUPS.map(({ label, presets }) => (
        <section key={label} className="sheet-section" aria-label={label}>
          <h3 className="label">{label}</h3>
          <ul className="choice-grid">{presets.map(renderChoice)}</ul>
        </section>
      ))}
      <section className="sheet-section" aria-label="Drums">
        <h3 className="label">Drums</h3>
        <ul className="choice-grid">{DRUM_KITS.map(renderChoice)}</ul>
      </section>
    </Overlay>
  )
}
