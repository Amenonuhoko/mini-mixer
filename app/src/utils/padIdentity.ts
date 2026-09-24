import { DRUM_KITS } from '../engine/drumSynth'
import { padLabel } from '../music/theory'
import type { AppState, Bank, Pad } from '../state/types'
import { drumVoiceIcon } from './instrumentIcon'

export interface PadIdentity {
  /** Its position in its bank, as shown on the pad ("01"). */
  number: string
  /** What it plays: a note/chord name, a kit voice, or the sample's name. */
  name: string
  /** A kit voice's glyph, when it has one. */
  icon: string | null
}

/**
 * How a pad is named wherever it appears — the pad grid and the sequencer
 * rows say the same thing, so a row is recognizable at a glance.
 */
export function padIdentity(state: Pick<AppState, 'samples' | 'key' | 'padLabels'>, bank: Bank, pad: Pad): PadIdentity {
  const index = bank.padIds.indexOf(pad.id)
  const number = String(index + 1).padStart(2, '0')
  if (pad.music) return { number, name: padLabel(pad.music, state.key, state.padLabels).name, icon: null }
  const sample = pad.sampleId ? state.samples[pad.sampleId] : undefined
  const sound = bank.sound
  const voice =
    sound?.type === 'kit' && pad.sampleId && bank.generatedSampleIds.includes(pad.sampleId)
      ? DRUM_KITS.find((kit) => kit.id === sound.kitId)?.voices[index]
      : undefined
  return { number, name: sample?.label ?? 'Empty', icon: voice ? drumVoiceIcon(voice.kind) : null }
}
