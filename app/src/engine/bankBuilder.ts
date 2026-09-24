import { bankLayout, noteName, chordName, type MusicalKey, type PadLayout } from '../music/theory'
import { buildKeySamples } from '../utils/buildInstrumentSamples'
import type { AppState, Bank, BankBuild, BankSound, PadMusic, Sample } from '../state/types'
import { buildDrumKitKeys, DRUM_KITS } from './drumSynth'
import { INSTRUMENT_PRESETS, mixBuffers, renderPresetNotes, renderRecordingNotes } from './synth'

/** The sound a melodic bank gets when something needs it to play before the user has picked one. */
export const DEFAULT_BANK_SOUNDS: Record<Bank['kind'], BankSound> = {
  drums: { type: 'kit', kitId: 'acoustic-drums' },
  bass: { type: 'preset', name: 'Bass' },
  chords: { type: 'preset', name: 'Piano' },
  melody: { type: 'preset', name: 'Pluck' },
}

export function soundName(sound: BankSound, samples: AppState['samples']): string {
  switch (sound.type) {
    case 'preset':
      return sound.name
    case 'kit':
      return DRUM_KITS.find((kit) => kit.id === sound.kitId)?.name ?? 'Drums'
    case 'recording':
      return samples[sound.sampleId]?.label ?? 'Recording'
  }
}

interface BuildContext {
  key: MusicalKey
  padLayout: PadLayout
  samples: AppState['samples']
}

/**
 * Renders a bank's pads for a sound: a drum kit is one pad per voice; a
 * melodic bank follows its layout for the project's key, rendering every
 * single note once (chord notes included — they form the arpeggiator's
 * note pool) and mixing chords from those notes.
 */
export async function buildBank(bank: Bank, sound: BankSound, context: BuildContext): Promise<BankBuild> {
  if (sound.type === 'kit') {
    const kit = DRUM_KITS.find((item) => item.id === sound.kitId) ?? DRUM_KITS[0]!
    const samples = buildKeySamples(await buildDrumKitKeys(kit.id), kit.voices.map((voice) => voice.name))
    return {
      bankId: bank.id,
      sound,
      columns: 0,
      pads: samples.map((sample) => ({ sampleId: sample.id, music: null })),
      samples,
      noteSampleIds: {},
    }
  }

  const layout = bankLayout(bank.kind === 'drums' ? 'melody' : bank.kind, context.key, context.padLayout)
  const allMidis = [...new Set(layout.pads.flatMap((pad) => pad.midis))].sort((a, b) => a - b)
  const buffers = await renderNotes(sound, allMidis, context.samples)
  const name = soundName(sound, context.samples)

  const noteSamples = buildKeySamples(
    allMidis.map((midi) => buffers.get(midi)!),
    allMidis.map((midi) => `${name} ${noteName(midi, context.key, true)}`),
  )
  const noteSampleIds = Object.fromEntries(allMidis.map((midi, i) => [String(midi), noteSamples[i]!.id]))

  const chordSamples: Sample[] = []
  const pads = layout.pads.map((music: PadMusic) => {
    if (music.kind === 'note') return { sampleId: noteSampleIds[String(music.midis[0]!)]!, music }
    const [chord] = buildKeySamples(
      [mixBuffers(music.midis.map((midi) => buffers.get(midi)!))],
      [`${name} ${chordName(music.midis, context.key)}`],
    )
    chordSamples.push(chord!)
    return { sampleId: chord!.id, music }
  })

  return {
    bankId: bank.id,
    sound,
    columns: layout.columns,
    pads,
    samples: [...noteSamples, ...chordSamples],
    noteSampleIds,
  }
}

async function renderNotes(sound: BankSound, midis: number[], samples: AppState['samples']): Promise<Map<number, AudioBuffer>> {
  if (sound.type === 'recording') {
    const recording = samples[sound.sampleId]
    if (!recording) throw new Error('That recording is no longer in the library')
    return renderRecordingNotes(recording.buffer, midis)
  }
  const preset = sound.type === 'preset' ? INSTRUMENT_PRESETS.find((item) => item.name === sound.name) : undefined
  return renderPresetNotes(preset ?? INSTRUMENT_PRESETS[0]!, midis)
}

/** Rebuilds every melodic bank that has a sound — what a key, mood or layout change needs. */
export function rebuildMelodicBanks(state: AppState, key: MusicalKey, padLayout: PadLayout): Promise<BankBuild[]> {
  return Promise.all(
    state.banks
      .filter((bank): bank is Bank & { sound: BankSound } => bank.kind !== 'drums' && bank.sound !== null)
      .map((bank) => buildBank(bank, bank.sound, { key, padLayout, samples: state.samples })),
  )
}
