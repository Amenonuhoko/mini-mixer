import { useState } from 'react'
import { buildDrumKitKeys, DRUM_KIT_VOICES } from '../engine/drumSynth'
import {
  buildInstrumentKeysFromPreset,
  buildInstrumentKeysFromRecording,
  INSTRUMENT_PRESETS,
  type InstrumentPreset,
} from '../engine/synth'
import { useAppState } from '../state/AppStateContext'
import { createId } from '../state/defaults'
import { buildKeySamples } from '../utils/buildInstrumentSamples'
import type { Instrument, Sample } from '../state/types'

/**
 * Instruments live in the Library, above the raw sample list — a place to
 * build a 16-key keyboard from either a bundled synth preset or one of your
 * own recordings (pitch-mapped across a range, the same detune mechanism the
 * live pitch dial already uses, just baked in once via an offline render).
 * Each key is a real library Sample under the hood — laying one across the
 * pads (via Instrument Mode, on the Pads page) is just ASSIGN_SAMPLE_TO_PAD
 * applied to a whole grid at once, no new playback path. Building lives here;
 * applying an instrument to the grid is a pad-grid mode, not a library action.
 */
export function InstrumentLibrary() {
  const { state, dispatch } = useAppState()
  const [building, setBuilding] = useState<string | null>(null)
  const [pickingRoot, setPickingRoot] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const instruments = state.instrumentOrder
    .map((id) => state.instruments[id])
    .filter((instrument): instrument is Instrument => instrument !== undefined)
  // Excludes samples that are themselves generated instrument keys (e.g. "Bass
  // 3") — picking one of those as a root would build an instrument out of a
  // synthesized/pitch-shifted note rather than an actual recording, which is
  // confusing more than useful.
  const instrumentKeyIds = new Set(instruments.flatMap((instrument) => instrument.keySampleIds))
  const recordableSamples = state.sampleOrder
    .map((id) => state.samples[id])
    .filter((sample): sample is Sample => sample !== undefined && !instrumentKeyIds.has(sample.id))

  const addInstrument = (name: string, source: Instrument['source'], keySamples: Sample[]) => {
    dispatch({
      type: 'ADD_INSTRUMENT',
      instrument: {
        id: createId('instrument'),
        name,
        source,
        keySampleIds: keySamples.map((s) => s.id),
      },
      keySamples,
    })
  }

  const handleBuildFromPreset = async (preset: InstrumentPreset) => {
    setBuilding(preset.name)
    try {
      const buffers = await buildInstrumentKeysFromPreset(preset)
      const labels = buffers.map((_, i) => `${preset.name} ${i + 1}`)
      addInstrument(preset.name, 'preset', buildKeySamples(buffers, labels))
    } finally {
      setBuilding(null)
    }
  }

  const handleBuildDrumKit = async () => {
    setBuilding('Drum Kit')
    try {
      const buffers = await buildDrumKitKeys()
      const labels = DRUM_KIT_VOICES.map((voice) => voice.name)
      addInstrument('Drum Kit', 'preset', buildKeySamples(buffers, labels))
    } finally {
      setBuilding(null)
    }
  }

  const handleBuildFromRecording = async (rootSample: Sample) => {
    setPickingRoot(false)
    setBuilding(rootSample.label)
    try {
      const buffers = await buildInstrumentKeysFromRecording(rootSample.buffer)
      const labels = buffers.map((_, i) => `${rootSample.label} ${i + 1}`)
      addInstrument(rootSample.label, 'recording', buildKeySamples(buffers, labels))
    } finally {
      setBuilding(null)
    }
  }

  return (
    <section className="panel instrument-library" aria-label="instruments">
      <h2>Instruments ({instruments.length})</h2>
      <p className="muted">
        Build a 16-key keyboard from a synth preset or one of your recordings. Turn on Instrument
        Mode from the Pads page to lay one across the grid.
      </p>

      {instruments.length > 0 && (
        <ul className="instrument-list">
          {instruments.map((instrument) => (
            <li key={instrument.id} className="instrument-row">
              <div className="instrument-row-info">
                <span className="instrument-name">{instrument.name}</span>
                <span className="tag tag-instrument-source">
                  {instrument.source === 'preset' ? 'preset' : 'from recording'}
                </span>
              </div>
              <div className="instrument-row-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-icon-only"
                  onClick={() => setConfirmDeleteId(instrument.id)}
                  aria-label={`Delete ${instrument.name}`}
                >
                  🗑
                </button>
              </div>
              {confirmDeleteId === instrument.id && (
                <div className="confirm-overwrite">
                  <span>Delete "{instrument.name}"? This removes its generated samples too.</span>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      dispatch({ type: 'REMOVE_INSTRUMENT', instrumentId: instrument.id })
                      setConfirmDeleteId(null)
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="instrument-build-actions">
        <span className="settings-label">New from preset</span>
        <div className="instrument-preset-buttons">
          {INSTRUMENT_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              className="btn btn-secondary preset-btn"
              onClick={() => void handleBuildFromPreset(preset)}
              disabled={building !== null}
            >
              {building === preset.name ? 'Building…' : preset.name}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-secondary preset-btn"
            onClick={() => void handleBuildDrumKit()}
            disabled={building !== null}
            title="16 distinct percussion voices (kick, snare, hats, toms, and more) — not one sound pitch-shifted, a different hit on every key"
          >
            {building === 'Drum Kit' ? 'Building…' : 'Drum Kit'}
          </button>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setPickingRoot(true)}
          disabled={building !== null || recordableSamples.length === 0}
        >
          New from a recording…
        </button>
        {recordableSamples.length === 0 && (
          <p className="muted">Record something first to build an instrument from it.</p>
        )}
      </div>

      {pickingRoot && (
        <div className="panel instrument-root-picker">
          <p>Pick a recording to spread across a keyboard:</p>
          <ul className="instrument-root-picker-list">
            {recordableSamples.map((sample) => (
              <li key={sample.id}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void handleBuildFromRecording(sample)}
                >
                  {sample.label}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-secondary" onClick={() => setPickingRoot(false)}>
            Cancel
          </button>
        </div>
      )}
    </section>
  )
}
