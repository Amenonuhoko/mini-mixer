import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DRUM_KITS } from '../engine/drumSynth'
import { soundName } from '../engine/bankBuilder'
import { performSummary, performVoice, Performer } from '../engine/performer'
import { useBankBuilder } from '../hooks/useBankBuilder'
import { usePadLooping } from '../hooks/usePadLooping'
import { keyShortName, moodById, padLabel, pitchClass, type PadLabel } from '../music/theory'
import { useAppState } from '../state/AppStateContext'
import { sectionBankLevel } from '../engine/songTimeline'
import { BANK_NAMES, bankColumns, getActiveBank, visibleBankPads } from '../state/banks'
import { MAX_PAD_COUNT, MIN_PAD_COUNT } from '../state/constants'
import { useEngine } from '../state/EngineContext'
import { drumVoiceIcon, instrumentIconForName } from '../utils/instrumentIcon'
import type { AudioEngine, Voice } from '../engine/AudioEngine'
import type { AppState, Bank, BankKind, BankSound, Pad } from '../state/types'
import { BankSoundPicker } from './BankSoundPicker'
import { BankTabs } from './BankTabs'
import { KeySheet } from './KeySheet'
import { LayerStrip } from './LayerStrip'
import { RecordDotIcon } from './icons'
import { PadEffectsMenuButton } from './PadEffectsMenuButton'
import { PadModeSwitch } from './PadModeSwitch'
import { PadPlaybackModeButton } from './PadPlaybackModeButton'
import { PerformPanel } from './PerformPanel'
import { Stepper } from './Stepper'
import { StaticWaveform } from './Waveform'

/** What a pad's face shows beyond its sample: a note/chord label for melodic pads, a drum glyph for kit pads. */
interface PadFace {
  label: PadLabel | null
  icon: string | null
  /** Plays the key's home note/chord — lit a little brighter so there's always somewhere safe to start. */
  home: boolean
}

function padFace(state: AppState, bank: Bank, pad: Pad, index: number): PadFace {
  if (pad.music) {
    return {
      label: padLabel(pad.music, state.key, state.padLabels),
      icon: null,
      home: pitchClass(pad.music.midis[0]!) === state.key.tonic,
    }
  }
  const sound = bank.sound
  if (sound?.type === 'kit' && pad.sampleId && bank.generatedSampleIds.includes(pad.sampleId)) {
    const voice = DRUM_KITS.find((kit) => kit.id === sound.kitId)?.voices[index]
    return { label: null, icon: voice ? drumVoiceIcon(voice.kind) : null, home: false }
  }
  return { label: null, icon: null, home: false }
}

/** One-tap starting sounds for an empty melodic bank; everything else is in the sound picker. */
const QUICK_SOUNDS: Record<Exclude<BankKind, 'drums'>, string[]> = {
  bass: ['Bass', 'Pluck', 'Organ'],
  chords: ['Piano', 'Pad', 'Organ'],
  melody: ['Pluck', 'Bell', 'Lead'],
}

interface PadGridProps {
  selectedPadId: string | null
  onSelectPad: (padId: string) => void
  /** Rendered at the bottom of the module — the selected pad's action strip (see PadsPage). */
  footer?: ReactNode
}

/**
 * The pad module: bank tabs (Drums · Bass · Chords · Melody) with the
 * trigger mode, whole-bank FX and step-record arm; a bank strip naming the
 * bank's sound and the project's mood/key; the labeled mode switch; the
 * grid; and a footer slot. Melodic pads are labeled with what they play
 * (name / feel / numeral — see Settings) and only offer notes and chords in
 * the key. Every pad is a light: it idles dim, glows with its own audio
 * level, flares on each hit (see LightShow), and breathes with the beat
 * while looping.
 */
export function PadGrid({ selectedPadId, onSelectPad, footer }: PadGridProps) {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const bank = getActiveBank(state)
  const visiblePads = visibleBankPads(state, bank)
  const loopModeEnabled = state.transport.padLoopModeEnabled
  const mixerModeEnabled = state.transport.padMixerModeEnabled
  const playbackMode = state.transport.padPlaybackMode
  const [sequencerRecordEnabled, setSequencerRecordEnabled] = useState(false)
  const [sheet, setSheet] = useState<'sound' | 'key' | null>(null)
  const [performOpen, setPerformOpen] = useState(false)
  const [volumeChoice, setVolumeChoice] = useState<{ focusId: string | null; sectionId: string } | null>(null)
  const focusedSectionId = state.transport.auditionScope === 'loop'
    ? state.transport.auditionSectionId
    : null
  const volumeSectionId = volumeChoice?.focusId === focusedSectionId
    ? volumeChoice?.sectionId
    : focusedSectionId
  const volumeSection = state.songSections.find((section) => section.id === volumeSectionId)
    ?? state.songSections.find((section) => section.id === focusedSectionId)
    ?? state.songSections.find((section) => section.patternId === state.activePatternId)
    ?? state.songSections[0]
  const sectionVolume = volumeSection ? Math.round(sectionBankLevel(volumeSection, bank.kind) * 100) : 100
  const bankRemoved = volumeSection?.excludedBanks?.includes(bank.kind) ?? false
  const performer = engine.getPerformer()
  const performLabel = performSummary(state.perform)

  useEffect(() => {
    performer.configure(state.perform, state.transport.bpm)
  }, [performer, state.perform, state.transport.bpm])

  // Loop and Mix take over the pads; leaving the pad module ends a latched arpeggio.
  useEffect(() => {
    if (loopModeEnabled || mixerModeEnabled) performer.stopAll()
  }, [performer, loopModeEnabled, mixerModeEnabled])
  useEffect(() => () => performer.stopAll(), [performer])

  // Step record captures every performed hit (repeats, arpeggio notes, strums) on the step it's heard on.
  const recordRef = useRef({ armed: sequencerRecordEnabled, state })
  useEffect(() => {
    recordRef.current = { armed: sequencerRecordEnabled, state }
  })
  useEffect(() => {
    performer.setListener((padId, sampleId, time) => {
      const { armed, state: current } = recordRef.current
      if (!armed || !current.transport.isPlaying) return
      const stepIndex = engine.stepAt(time)
      if (stepIndex === null) return
      dispatch({ type: 'SET_STEP_SAMPLE', patternId: current.activePatternId, padId, stepIndex, sampleId })
    })
    return () => performer.setListener(null)
  }, [performer, engine, dispatch])
  const melodic = bank.kind !== 'drums'
  const columns = bankColumns(bank)
  const moodLabel = state.mood ? moodById(state.mood).name : 'Custom'

  return (
    <section className="module pad-grid" aria-label="Pads">
      <header className="module-head">
        <BankTabs />
        <div className="module-head-tools">
          <button
            type="button"
            className={['chip-btn', 'perform-toggle', performLabel ? 'on' : '', performOpen ? 'open' : ''].filter(Boolean).join(' ')}
            onClick={() => setPerformOpen((open) => !open)}
            aria-expanded={performOpen}
            title="Note repeat, arpeggiator and strum"
          >
            {performLabel ?? 'Perform'}
          </button>
          <PadPlaybackModeButton />
          <PadEffectsMenuButton followPadId={selectedPadId} />
          <button
            type="button"
            className={sequencerRecordEnabled ? 'icon-btn armed' : 'icon-btn'}
            onClick={() => setSequencerRecordEnabled((enabled) => !enabled)}
            aria-pressed={sequencerRecordEnabled}
            aria-label="Record pad hits into the playing sequencer"
            title={
              sequencerRecordEnabled
                ? 'Step record armed — pad hits write into the playing step'
                : 'Arm step record — play pads while the sequence runs to write them in'
            }
          >
            <RecordDotIcon size={14} />
          </button>
        </div>
      </header>
      <div className="bank-strip">
        <button type="button" className="bank-sound" onClick={() => setSheet('sound')} title="Change this bank’s sound">
          <span className="bank-sound-icon" aria-hidden="true">{bankSoundIcon(bank.sound)}</span>
          <span className="bank-sound-name">
            {bank.sound ? soundName(bank.sound, state.samples) : melodic ? 'Pick a sound' : 'Your sounds'}
          </span>
        </button>
        <button type="button" className="bank-key" onClick={() => setSheet('key')} title="Change the mood and key">
          <span className="bank-key-mood">{moodLabel}</span>
          <span className="bank-key-name readout">{keyShortName(state.key)}</span>
        </button>
        {!melodic && (
          <Stepper
            label="Pads"
            value={String(bank.visibleCount).padStart(2, '0')}
            onDecrement={() => dispatch({ type: 'SET_VISIBLE_PAD_COUNT', count: bank.visibleCount - 1 })}
            onIncrement={() => dispatch({ type: 'SET_VISIBLE_PAD_COUNT', count: bank.visibleCount + 1 })}
            decrementDisabled={bank.visibleCount <= MIN_PAD_COUNT}
            incrementDisabled={bank.visibleCount >= MAX_PAD_COUNT}
            decrementTitle="Hide the last pad (its sound and steps are kept)"
            incrementTitle="Add a pad"
          />
        )}
      </div>
      <LayerStrip kind={bank.kind} />
      {volumeSection && (
        <div className="pad-song-volume" role="group" aria-label="Song part volume">
          <label className="pad-song-part">
            Song part
            <select
              value={volumeSection.id}
              onChange={(event) => setVolumeChoice({ focusId: focusedSectionId, sectionId: event.target.value })}
              aria-label="Song part to mix"
            >
              {state.songSections.map((section, index) => (
                <option key={section.id} value={section.id}>{index + 1}. {section.name}</option>
              ))}
            </select>
          </label>
          <label className="pad-song-level">
            <span>{BANK_NAMES[bank.kind]} in {volumeSection.name} <strong>{bankRemoved ? 'Removed' : `${sectionVolume}%`}</strong></span>
            <input
              type="range"
              min={0}
              max={100}
              value={sectionVolume}
              disabled={bankRemoved}
              aria-label={`${BANK_NAMES[bank.kind]} volume in ${volumeSection.name}`}
              onChange={(event) => dispatch({
                type: 'SET_SONG_SECTION_BANK_VOLUME',
                sectionId: volumeSection.id,
                bank: bank.kind,
                level: Number(event.target.value),
              })}
            />
          </label>
          <button
            type="button"
            className="chip-btn"
            onClick={() => {
              engine.setSequencerPlaybackEnabled(false)
              engine.stopAllSounds()
              dispatch({ type: 'SET_ACTIVE_PATTERN', patternId: volumeSection.patternId })
              dispatch({ type: 'AUDITION_SONG_SECTION', sectionId: volumeSection.id, scope: 'loop' })
            }}
            aria-label={`Loop ${volumeSection.name} while mixing`}
          >
            ▶ Hear part
          </button>
          {bankRemoved && <span className="pad-song-volume-note">Restore {BANK_NAMES[bank.kind]} in Seq to hear it.</span>}
        </div>
      )}
      {performOpen && <PerformPanel />}
      <PadModeSwitch />
      {melodic && visiblePads.length === 0 ? (
        <EmptyBank bank={bank} kind={bank.kind as Exclude<BankKind, 'drums'>} onMore={() => setSheet('sound')} />
      ) : (
        <div
          className={[
            'pad-grid-cells',
            loopModeEnabled ? 'loop-mode' : '',
            mixerModeEnabled ? 'mixer-mode' : '',
            columns > 4 ? 'dense' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ '--cols': columns } as React.CSSProperties}
        >
          {visiblePads.map((pad, index) => {
            const face = padFace(state, bank, pad, index)
            return mixerModeEnabled ? (
              <MixerPadFader key={pad.id} pad={pad} index={index} engine={engine} face={face} />
            ) : (
              <PadButton
                key={pad.id}
                pad={pad}
                bank={bank}
                performer={performer}
                index={index}
                engine={engine}
                selected={pad.id === selectedPadId}
                loopModeEnabled={loopModeEnabled}
                playbackMode={playbackMode}
                sequencerRecordEnabled={sequencerRecordEnabled}
                face={face}
                onSelect={onSelectPad}
              />
            )
          })}
        </div>
      )}
      {footer}
      {sheet === 'sound' && <BankSoundPicker bank={bank} onClose={() => setSheet(null)} />}
      {sheet === 'key' && <KeySheet onClose={() => setSheet(null)} />}
    </section>
  )
}

function bankSoundIcon(sound: BankSound | null): string {
  if (!sound) return '＋'
  if (sound.type === 'recording') return '🎤'
  if (sound.type === 'kit') return instrumentIconForName(DRUM_KITS.find((kit) => kit.id === sound.kitId)?.name ?? '')
  return instrumentIconForName(sound.name)
}

interface EmptyBankProps {
  bank: Bank
  kind: Exclude<BankKind, 'drums'>
  onMore: () => void
}

/** An empty melodic bank is one tap from playable: pick a starting sound and it's laid out in the key. */
function EmptyBank({ bank, kind, onMore }: EmptyBankProps) {
  const { busy, error, setBankSound } = useBankBuilder()
  return (
    <div className="bank-empty">
      <p className="bank-empty-text">
        Give <strong>{BANK_NAMES[kind]}</strong> a sound — its pads will only play {kind === 'chords' ? 'chords' : 'notes'} that fit
        the mood.
      </p>
      <div className="bank-empty-choices">
        {QUICK_SOUNDS[kind].map((name) => (
          <button
            key={name}
            type="button"
            className="choice"
            disabled={busy !== null}
            onClick={() => void setBankSound(bank, { type: 'preset', name }, name)}
          >
            <span className="choice-icon" aria-hidden="true">{instrumentIconForName(name)}</span>
            <span className="choice-name">{busy === name ? 'Building…' : name}</span>
          </button>
        ))}
        <button type="button" className="choice" disabled={busy !== null} onClick={onMore}>
          <span className="choice-icon" aria-hidden="true">⋯</span>
          <span className="choice-name">More</span>
        </button>
      </div>
      {error && <p className="sheet-error" role="alert">{error}</p>}
    </div>
  )
}

/** The pad's face text: a melodic pad's label, or a drum/sample pad's number, glyph and name. */
function PadFaceContent({ pad, index, face, sampleLabel }: { pad: Pad; index: number; face: PadFace; sampleLabel: string | undefined }) {
  if (face.label) {
    return (
      <span className="pad-label" aria-hidden="true">
        <span className="pad-primary">{face.label.primary}</span>
        {face.label.secondary && <span className="pad-secondary">{face.label.secondary}</span>}
      </span>
    )
  }
  return (
    <>
      <span className="pad-num" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      {face.icon && (
        <span className="pad-key" aria-hidden="true">
          <span className="pad-key-icon">{face.icon}</span>
        </span>
      )}
      <span className="pad-name" aria-hidden="true">
        {pad.muted ? 'Muted' : sampleLabel ?? '+'}
      </span>
    </>
  )
}

interface PadButtonProps {
  pad: Pad
  bank: Bank
  performer: Performer
  index: number
  engine: AudioEngine
  selected: boolean
  loopModeEnabled: boolean
  playbackMode: 'gate' | 'oneshot'
  /** When armed, pad hits add their sound to the current sequencer step during playback. */
  sequencerRecordEnabled: boolean
  face: PadFace
  onSelect: (padId: string) => void
}

/**
 * A pad is one undivided tap target. Its behavior depends on the global loop
 * mode (see PadModeSwitch): off (the default) — pressing plays the
 * sample and releasing stops it immediately, a gate every time regardless of
 * how long the press was held — hold to let it ring out, release early to
 * cut it short. On — pressing toggles this pad's loop instead, and gating
 * doesn't apply (there's nothing to gate, it's a discrete on/off). Either
 * way, loop and mute stay off the pad face itself — see the selected-pad
 * action bar in PadsPage — this is purely a playback trigger, not a settings
 * surface.
 */
function PadButton({
  pad,
  bank,
  performer,
  index,
  engine,
  selected,
  loopModeEnabled,
  playbackMode,
  sequencerRecordEnabled,
  face,
  onSelect,
}: PadButtonProps) {
  const { state, dispatch } = useAppState()
  const looping = usePadLooping(engine, pad.id)
  const filled = pad.sampleId !== null
  const sample = pad.sampleId ? state.samples[pad.sampleId] : undefined

  // A physical input is independently tracked by pointer id. A Map (rather
  // than one source ref) is what lets multiple fingers hold separate pads—or
  // even retrigger the same pad—without one release cutting off another.
  const activeSourcesRef = useRef(new Map<number, Voice>())
  // Pointers whose press went to the performer (repeat / arp / strum), released there too.
  const performingRef = useRef(new Set<number>())

  /** Hands the press to the performer if the current perform settings need it; false means play it plainly. */
  const tryPerform = (pointerId: number, gate: boolean): boolean => {
    const voice = performVoice(state, bank, pad)
    if (!voice || !Performer.handles(state.perform, voice)) return false
    performer.press(`${pad.id}:${pointerId}`, voice, gate)
    performingRef.current.add(pointerId)
    return true
  }

  const releasePerform = (pointerId: number): boolean => {
    if (!performingRef.current.delete(pointerId)) return false
    performer.release(`${pad.id}:${pointerId}`)
    return true
  }

  const recordCurrentStep = () => {
    if (!sequencerRecordEnabled || !state.transport.isPlaying || !pad.sampleId) return
    dispatch({
      type: 'SET_STEP_SAMPLE',
      patternId: state.activePatternId,
      padId: pad.id,
      stepIndex: engine.stepAt(engine.getAudioTime() ?? 0) ?? 0,
      sampleId: pad.sampleId,
    })
  }

  const stopActiveSource = (pointerId: number) => {
    const source = activeSourcesRef.current.get(pointerId)
    if (!source) return
    try {
      source.stop()
    } catch {
      // Already ended naturally between the press and this release — nothing to stop.
    }
    activeSourcesRef.current.delete(pointerId)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    onSelect(pad.id)
    if (!pad.sampleId) return
    // Capture so a finger drifting off this small tile mid-press still
    // reports its release here, not to whichever pad it ends up over —
    // pads sit right next to each other, unlike the isolated record FAB.
    // Set for a muted pad too: in loop mode, releasing still needs to be
    // able to stop an already-looping pad even while it's muted.
    event.currentTarget.setPointerCapture(event.pointerId)

    if (loopModeEnabled || pad.muted) return
    // Both Gate and One-shot begin from Pointer Events. Touch browsers only
    // guarantee a synthetic click for the primary finger, whereas pointerdown
    // is delivered independently to every simultaneous finger.
    const sample = state.samples[pad.sampleId]
    if (!sample) return
    if (tryPerform(event.pointerId, playbackMode === 'gate')) return
    recordCurrentStep()
    const source = engine.triggerPad(pad, sample.buffer)
    if (playbackMode === 'gate') activeSourcesRef.current.set(event.pointerId, source)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (loopModeEnabled) {
      if (!pad.sampleId) return
      // Muted blocks starting a new loop, same as a plain tap would, but
      // never blocks stopping one already running — a pad muted mid-loop
      // must still be stoppable.
      if (pad.muted && !looping) return
      const sample = state.samples[pad.sampleId]
      if (!sample) return
      engine.toggleLoop(pad, sample.buffer)
      return
    }

    if (releasePerform(event.pointerId)) return
    if (playbackMode === 'gate') stopActiveSource(event.pointerId)
  }

  const handlePointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    // A dropped gesture (OS interruption, scroll takeover) behaves like a
    // release for gating purposes, but never toggles a loop — an incomplete
    // gesture shouldn't commit to a discrete on/off action.
    if (releasePerform(event.pointerId)) return
    if (playbackMode === 'gate') stopActiveSource(event.pointerId)
  }

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Physical Gate, Loop, and One-shot presses are fully handled through
    // Pointer Events above. A detail-0 click is keyboard activation, which has
    // no pointer lifecycle and should still trigger one complete audible hit.
    if (event.detail !== 0) return
    onSelect(pad.id)
    if (!pad.sampleId) return

    const sample = state.samples[pad.sampleId]
    if (!sample) return
    if (loopModeEnabled) {
      if (!pad.muted || looping) engine.toggleLoop(pad, sample.buffer)
      return
    }
    if (!pad.muted) {
      // Keyboard activation is a tap: one hit (strummed if strum is on), never a held repeat.
      if (tryPerform(-1, false)) {
        releasePerform(-1)
        return
      }
      recordCurrentStep()
      engine.triggerPad(pad, sample.buffer)
    }
  }

  return (
    <button
      type="button"
      className={[
        'pad',
        filled ? 'filled' : 'empty',
        selected ? 'selected' : '',
        looping ? 'looping' : '',
        pad.muted ? 'muted' : '',
        face.label ? 'labeled' : '',
        face.home ? 'home' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-pad-id={pad.id}
      data-glow-pad={pad.id}
      aria-label={`Pad ${index + 1}${face.label ? `: ${face.label.name}` : sample ? `: ${sample.label}` : ', empty'}${pad.muted ? ', muted' : ''}${looping ? ', looping' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handlePointerCancel}
      onClick={handleClick}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="pad-glow" aria-hidden="true" />
      <span className="pad-flash" aria-hidden="true" />
      <span className="pad-bloom" aria-hidden="true" />
      {!face.label && sample && sample.peaks.length > 0 && (
        <span className="pad-wave" aria-hidden="true">
          <StaticWaveform peaks={sample.peaks} />
        </span>
      )}
      <PadFaceContent pad={pad} index={index} face={face} sampleLabel={sample?.label} />
    </button>
  )
}

interface MixerPadFaderProps {
  pad: Pad
  index: number
  engine: AudioEngine
  face: PadFace
}

/**
 * Mixer Mode's alternate rendering for a pad tile: a vertical fader instead
 * of a tap target — nothing plays from touching it. Dragging (or just
 * tapping a spot) sets pad.mixLevel from the vertical position within the
 * tile: top is 100 (unity), bottom is 0 (silent). Live-updates a currently-
 * looping pad's actual gain too, the same "dial changes are audible
 * immediately" behavior every other pad dial already has.
 */
function MixerPadFader({ pad, index, engine, face }: MixerPadFaderProps) {
  const { dispatch } = useAppState()
  const looping = usePadLooping(engine, pad.id)
  const draggingRef = useRef(false)

  const levelFromPointer = (event: React.PointerEvent<HTMLButtonElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect()
    const fraction = 1 - (event.clientY - rect.top) / rect.height
    return Math.round(Math.max(0, Math.min(1, fraction)) * 100)
  }

  const applyLevel = (level: number) => {
    dispatch({ type: 'SET_PAD_MIX_LEVEL', padId: pad.id, level })
    if (looping) engine.updateLoopingPadMixLevel(pad.id, level)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    draggingRef.current = true
    applyLevel(levelFromPointer(event))
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return
    applyLevel(levelFromPointer(event))
  }

  const endDrag = () => {
    draggingRef.current = false
  }

  return (
    <button
      type="button"
      className={looping ? 'pad mixer-fader looping' : 'pad mixer-fader'}
      data-pad-id={pad.id}
      data-glow-pad={pad.id}
      aria-label={`Pad ${index + 1} level ${pad.mixLevel}%`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span className="pad-glow" aria-hidden="true" />
      <span className="mixer-fader-fill" style={{ height: `${pad.mixLevel}%` }} aria-hidden="true" />
      <span className="pad-num" aria-hidden="true">{face.label?.primary ?? String(index + 1).padStart(2, '0')}</span>
      {face.icon && (
        <span className="pad-key" aria-hidden="true">
          <span className="pad-key-icon">{face.icon}</span>
        </span>
      )}
      <span className="mixer-fader-level readout" aria-hidden="true">{pad.mixLevel}</span>
    </button>
  )
}
