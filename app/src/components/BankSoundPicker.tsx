import { DRUM_KITS } from '../engine/drumSynth'
import { INSTRUMENT_PRESETS } from '../engine/synth'
import { useBankBuilder } from '../hooks/useBankBuilder'
import { keyName } from '../music/theory'
import { useAppState } from '../state/AppStateContext'
import { BANK_NAMES, soundKey } from '../state/banks'
import type { Bank, BankSound } from '../state/types'
import { instrumentIconForName } from '../utils/instrumentIcon'
import { Overlay } from './Overlay'

const PRESET_GROUPS = [
  { label: 'Keys', names: ['Piano', 'Electric Piano', 'Organ', 'Bell', 'Marimba'] },
  { label: 'Strings', names: ['Guitar', 'Pluck', 'Bass', 'Velvet Strings'] },
  { label: 'Winds', names: ['Alto Saxophone', 'Trumpet', 'Flute', 'Clarinet'] },
  { label: 'Synths', names: ['Lead', 'Pad', 'Sub Bass', 'Chiptune'] },
  { label: 'Playful', names: ['Rubber Duck', 'Bubble Keys'] },
].map(({ label, names }) => ({
  label,
  names: names.filter((name) => INSTRUMENT_PRESETS.some((preset) => preset.name === name)),
}))

interface Choice {
  id: string
  name: string
  icon: string
  sound: BankSound
}

interface BankSoundPickerProps {
  bank: Bank
  onClose: () => void
}

/**
 * Which sound a bank plays. Drums pick a kit (one drum per pad); melodic
 * banks pick an instrument — or any of your recordings, played as notes —
 * and it's laid out in the project's key. Programmed steps follow the new
 * sound; the old sound's rendered notes are cleaned up.
 */
export function BankSoundPicker({ bank, onClose }: BankSoundPickerProps) {
  const { state } = useAppState()
  const { busy, error, setBankSound } = useBankBuilder()
  const current = soundKey(bank.sound)

  const pick = async (choice: Choice) => {
    await setBankSound(bank, choice.sound, choice.id)
    onClose()
  }

  const renderChoices = (choices: Choice[]) => (
    <ul className="choice-grid">
      {choices.map((choice) => (
        <li key={choice.id}>
          <button
            type="button"
            className={soundKey(choice.sound) === current ? 'choice on' : 'choice'}
            onClick={() => void pick(choice)}
            disabled={busy !== null}
            title={INSTRUMENT_PRESETS.find((preset) => preset.name === choice.name)?.description}
            aria-pressed={soundKey(choice.sound) === current}
          >
            <span className="choice-icon" aria-hidden="true">{choice.icon}</span>
            <span className="choice-name">{busy === choice.id ? 'Building…' : choice.name}</span>
          </button>
        </li>
      ))}
    </ul>
  )

  const presetChoice = (name: string): Choice => ({
    id: `preset:${name}`,
    name,
    icon: instrumentIconForName(name),
    sound: { type: 'preset', name },
  })

  const recordings: Choice[] = state.sampleOrder
    .map((id) => state.samples[id])
    .filter((sample) => sample?.kind === 'recording')
    .map((sample) => ({ id: `recording:${sample!.id}`, name: sample!.label, icon: '🎤', sound: { type: 'recording', sampleId: sample!.id } }))

  const subtitle =
    bank.kind === 'drums'
      ? 'One drum per pad. Your recordings stay in the Library.'
      : `Laid out in ${keyName(state.key)}. Programmed notes follow the new sound.`

  return (
    <Overlay onClose={onClose} title={`${BANK_NAMES[bank.kind]} sound`} subtitle={subtitle}>
      {error && <p className="sheet-error" role="alert">{error}</p>}
      {bank.kind === 'drums' ? (
        <section className="sheet-section" aria-label="Kits">
          <h3 className="label">Kits</h3>
          {renderChoices(DRUM_KITS.map((kit) => ({ id: `kit:${kit.id}`, name: kit.name, icon: instrumentIconForName(kit.name), sound: { type: 'kit', kitId: kit.id } })))}
        </section>
      ) : (
        <>
          {PRESET_GROUPS.map(({ label, names }) => (
            <section key={label} className="sheet-section" aria-label={label}>
              <h3 className="label">{label}</h3>
              {renderChoices(names.map(presetChoice))}
            </section>
          ))}
          <section className="sheet-section" aria-label="Your recordings">
            <h3 className="label">Your recordings</h3>
            {recordings.length > 0 ? (
              renderChoices(recordings)
            ) : (
              <p className="muted sheet-note">Record something and it can be played as notes here — it’s treated as middle C.</p>
            )}
          </section>
        </>
      )}
    </Overlay>
  )
}
