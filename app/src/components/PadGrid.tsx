import { useEffect, useRef, useState, type RefObject } from 'react'
import { DRUM_KITS } from '../engine/drumSynth'
import { soundName } from '../engine/bankBuilder'
import { performSummary, performVoice, Performer } from '../engine/performer'
import { useBankBuilder } from '../hooks/useBankBuilder'
import { usePadLooping } from '../hooks/usePadLooping'
import { keyShortName, moodById, padLabel, pitchClass, type PadLabel } from '../music/theory'
import { useAppState } from '../state/AppStateContext'
import { useNavigation } from '../state/NavigationContext'
import { BANK_NAMES, bankColumns, getActiveBank, visibleBankPads } from '../state/banks'
import { useEngine } from '../state/EngineContext'
import { drumVoiceIcon, instrumentIconForName } from '../utils/instrumentIcon'
import { keysOwnedElsewhere, padIndexForCode, padKeyAt } from '../utils/keyboard'
import type { AudioEngine, Voice } from '../engine/AudioEngine'
import type { AppState, Bank, BankKind, BankSound, Pad } from '../state/types'
import { BankSoundPicker } from './BankSoundPicker'
import { BankTabs } from './BankTabs'
import { StudioViewToggle } from './StudioViewToggle'
import { KeySheet } from './KeySheet'
import { RecordDotIcon } from './icons'
import { PadModeSwitch } from './PadModeSwitch'
import { PadPlaybackModeButton } from './PadPlaybackModeButton'
import { BankEffectsPanel } from './BankEffectsPanel'
import { PerformPanel } from './PerformPanel'
import { RecordStrip } from './RecordStrip'
import { RecordButton, RecordSourceToggle } from './RecordButton'
import type { PendingRecording } from './RecordingReview'
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

/** How a pad is played from the keyboard: the same press and release a pointer makes, keyed by an input id of the key's own. */
interface PadKeyTarget {
  press: (inputId: number) => void
  release: (inputId: number) => void
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
  /** A new recording (mic or live mix) ready to review. */
  onRecorded: (recording: PendingRecording) => void
}

/**
 * The pad module, top to bottom: bank tabs (Drums · Bass · Chords · Melody);
 * one setup row — the bank's sound (its sheet also sets how many pads the
 * bank shows), the project's mood/key, and hold-to-record with its mic / live
 * mix switch; the grid; and, pinned to the bottom of the screen while
 * the grid scrolls, how the pads respond — Play / Loop / Mix, then gate or
 * one-shot, Perform (repeat, arp, strum) and step record; in Mix those give
 * way to a hint. Mix shows the bank's one volume slider and effects above
 * the grid (see BankMix), and tapping a pad there opens its own sheet. Melodic pads are
 * labeled with what they play (name / feel / numeral — see Settings) and
 * only offer notes and chords in the key. Every pad is a light: it idles
 * dim, glows with its own audio level, flares on each hit (see LightShow),
 * and breathes with the beat while looping.
 */
export function PadGrid({ selectedPadId, onSelectPad, onRecorded }: PadGridProps) {
  const { state, dispatch } = useAppState()
  const { goToEditPad } = useNavigation()
  const engine = useEngine()
  const bank = getActiveBank(state)
  const visiblePads = visibleBankPads(state, bank)
  const loopModeEnabled = state.transport.padLoopModeEnabled
  const mixerModeEnabled = state.transport.padMixerModeEnabled
  const playbackMode = state.transport.padPlaybackMode
  const [sequencerRecordEnabled, setSequencerRecordEnabled] = useState(false)
  const [sheet, setSheet] = useState<'sound' | 'key' | null>(null)
  const [performOpen, setPerformOpen] = useState(false)
  const performer = engine.getPerformer()
  const performLabel = performSummary(state.perform)

  useEffect(() => {
    performer.configure(state.perform, state.transport.bpm)
  }, [performer, state.perform, state.transport.bpm])

  // Loop and Mix take over the pads; leaving the pad module ends a latched arpeggio.
  useEffect(() => {
    if (loopModeEnabled || mixerModeEnabled) performer.stopAll()
  }, [performer, loopModeEnabled, mixerModeEnabled])
  // Mix hides the Perform toggle, so an open panel would be stuck on screen
  // with no way to close it: close it whenever Loop or Mix takes over.
  const padsTakenOver = loopModeEnabled || mixerModeEnabled
  const [wasTakenOver, setWasTakenOver] = useState(padsTakenOver)
  if (wasTakenOver !== padsTakenOver) {
    setWasTakenOver(padsTakenOver)
    if (padsTakenOver) setPerformOpen(false)
  }
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

  // The computer keyboard plays the pads (see utils/keyboard for the map):
  // each pad button registers its press/release here, and one window
  // listener routes keys to them. A key is its own input, released on keyup
  // — or on losing the window, so a note can't be left held behind Alt-Tab.
  const keyTargets = useRef(new Map<number, PadKeyTarget>())
  const padCount = visiblePads.length
  useEffect(() => {
    if (mixerModeEnabled) return
    const held = new Map<string, number>()
    const inputIds = new Map<string, number>()
    const inputIdFor = (code: string) => {
      let id = inputIds.get(code)
      if (id === undefined) {
        // Negative, so a key can never collide with a pointer id.
        id = -(1 + inputIds.size)
        inputIds.set(code, id)
      }
      return id
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      const index = padIndexForCode(event.code, columns, padCount)
      if (index === null || keysOwnedElsewhere(event.target)) return
      event.preventDefault()
      const target = keyTargets.current.get(index)
      if (!target) return
      held.set(event.code, index)
      target.press(inputIdFor(event.code))
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      const index = held.get(event.code)
      if (index === undefined) return
      held.delete(event.code)
      keyTargets.current.get(index)?.release(inputIdFor(event.code))
    }
    const releaseAll = () => {
      for (const [code, index] of held) keyTargets.current.get(index)?.release(inputIdFor(code))
      held.clear()
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', releaseAll)
    return () => {
      releaseAll()
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', releaseAll)
    }
  }, [columns, padCount, mixerModeEnabled])

  return (
    <section className={`module pad-grid bank-${bank.kind}`} aria-label="Pads">
      <header className="module-head">
        <BankTabs />
        <StudioViewToggle panel="pads" />
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
        <div className="bank-record" role="group" aria-label="Record a sound">
          <RecordButton sampleCount={Object.keys(state.samples).length} onRecorded={onRecorded} compact />
          <RecordSourceToggle />
        </div>
      </div>
      {mixerModeEnabled && <BankMix bank={bank} />}
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
              <MixPadTile key={pad.id} pad={pad} index={index} engine={engine} face={face} onOpen={() => { onSelectPad(pad.id); goToEditPad(pad.id) }} />
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
                keyHint={padKeyAt(index, columns, padCount)?.label ?? null}
                keyTargets={keyTargets}
                onSelect={onSelectPad}
              />
            )
          })}
        </div>
      )}
      {/* How the pads respond — pinned to the bottom of the screen while the grid scrolls. */}
      <div className="pad-play-dock" data-no-page-swipe>
        {performOpen && !padsTakenOver && <PerformPanel />}
        {sequencerRecordEnabled && <RecordStrip engine={engine} />}
        <div className="pad-play-row">
          <PadModeSwitch />
          {mixerModeEnabled ? (
            <div className="pad-play-tools">
              <span className="pad-mix-hint">Tap a pad for its own level, sound, trim &amp; effects</span>
            </div>
          ) : (
          <div className="pad-play-tools">
            <PadPlaybackModeButton />
            <button
              type="button"
              className={['chip-btn', 'perform-toggle', performLabel ? 'on' : '', performOpen ? 'open' : ''].filter(Boolean).join(' ')}
              onClick={() => setPerformOpen((open) => !open)}
              aria-expanded={performOpen}
              title="Note repeat, arpeggiator and strum"
            >
              {performLabel ?? 'Perform'}
            </button>
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
          )}
        </div>
      </div>
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
  /** The keyboard key that plays this pad, printed on it for mouse-and-keyboard screens; null when it has none. */
  keyHint: string | null
  /** Where this pad registers how the keyboard plays it (see PadGrid). */
  keyTargets: RefObject<Map<number, PadKeyTarget>>
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
  keyHint,
  keyTargets,
  onSelect,
}: PadButtonProps) {
  const { state, dispatch } = useAppState()
  const looping = usePadLooping(engine, pad.id)
  const filled = pad.sampleId !== null
  const sample = pad.sampleId ? state.samples[pad.sampleId] : undefined
  const buttonRef = useRef<HTMLButtonElement>(null)

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

  /**
   * A press begins, from one physical input — a pointer or a key, told apart
   * by an id the release will carry too. In loop mode a press does nothing
   * yet (the release toggles the loop); otherwise it's a Gate or One-shot
   * hit, unless the performer takes it (repeat / arp / strum).
   */
  const startHit = (inputId: number) => {
    if (!pad.sampleId || loopModeEnabled || pad.muted) return
    const sample = state.samples[pad.sampleId]
    if (!sample) return
    if (tryPerform(inputId, playbackMode === 'gate')) return
    recordCurrentStep()
    const source = engine.triggerPad(pad, sample.buffer)
    if (playbackMode === 'gate') activeSourcesRef.current.set(inputId, source)
  }

  /** The matching release: toggles the loop in loop mode, otherwise lets the performer or the gate go. */
  const endHit = (inputId: number) => {
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

    if (releasePerform(inputId)) return
    if (playbackMode === 'gate') stopActiveSource(inputId)
  }

  // The keyboard plays this pad exactly as a pointer does. The handlers
  // close over the current state, so the registered target reads the latest
  // pair through a ref rather than being re-registered every render; the
  // held look is a data attribute React doesn't manage, so a re-render
  // mid-press (selecting the pad is one) can't wipe it.
  const hitHandlers = useRef({ startHit, endHit })
  useEffect(() => {
    hitHandlers.current = { startHit, endHit }
  })
  useEffect(() => {
    const targets = keyTargets.current
    targets.set(index, {
      press: (inputId) => {
        buttonRef.current?.setAttribute('data-held', '')
        onSelect(pad.id)
        hitHandlers.current.startHit(inputId)
      },
      release: (inputId) => {
        buttonRef.current?.removeAttribute('data-held')
        hitHandlers.current.endHit(inputId)
      },
    })
    return () => {
      targets.delete(index)
    }
  }, [index, keyTargets, onSelect, pad.id])

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    onSelect(pad.id)
    if (!pad.sampleId) return
    // Capture so a finger drifting off this small tile mid-press still
    // reports its release here, not to whichever pad it ends up over —
    // pads sit right next to each other, unlike the isolated record FAB.
    // Set for a muted pad too: in loop mode, releasing still needs to be
    // able to stop an already-looping pad even while it's muted.
    event.currentTarget.setPointerCapture(event.pointerId)
    // Both Gate and One-shot begin from Pointer Events. Touch browsers only
    // guarantee a synthetic click for the primary finger, whereas pointerdown
    // is delivered independently to every simultaneous finger.
    startHit(event.pointerId)
  }

  // Swipe-to-strum: a finger dragged across the grid plays each pad it
  // crosses, like running a hand over strings. Every swept pad gets its own
  // input id (offset so it can't clash with a real pointer or key) and is
  // let go when the finger leaves it or lifts.
  const sweptRef = useRef(new Map<number, number>())
  const releaseSwept = (pointerId: number) => {
    const swept = sweptRef.current.get(pointerId)
    if (swept === undefined) return
    sweptRef.current.delete(pointerId)
    keyTargets.current.get(swept)?.release(SWIPE_INPUT_BASE + pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (loopModeEnabled || event.buttons === 0) return
    const under = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-pad-index]')
    const target = under ? Number(under.dataset.padIndex) : null
    const current = sweptRef.current.get(event.pointerId) ?? index
    if (target === null || target === current) return
    releaseSwept(event.pointerId)
    if (target === index) return
    sweptRef.current.set(event.pointerId, target)
    keyTargets.current.get(target)?.press(SWIPE_INPUT_BASE + event.pointerId)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    releaseSwept(event.pointerId)
    endHit(event.pointerId)
  }

  const handlePointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    // A dropped gesture (OS interruption, scroll takeover) behaves like a
    // release for gating purposes, but never toggles a loop — an incomplete
    // gesture shouldn't commit to a discrete on/off action.
    releaseSwept(event.pointerId)
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
      ref={buttonRef}
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
      data-pad-index={index}
      data-glow-pad={pad.id}
      aria-label={`Pad ${index + 1}${face.label ? `: ${face.label.name}` : sample ? `: ${sample.label}` : ', empty'}${pad.muted ? ', muted' : ''}${looping ? ', looping' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
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
      {keyHint && filled && <span className="pad-hint" aria-hidden="true">{keyHint}</span>}
    </button>
  )
}

/** Input ids for pads played by a swipe: far from pointer ids (small, positive) and key ids (negative). */
const SWIPE_INPUT_BASE = 1_000_000

interface MixPadTileProps {
  pad: Pad
  index: number
  engine: AudioEngine
  face: PadFace
  /** Open this pad's sheet. */
  onOpen: () => void
}

/**
 * A pad in Mix: a tile that opens the pad's own sheet (level, mute, sound,
 * trim, effects — see PadEditOverlay) instead of playing it. The bank's
 * volume and effects sit above the grid (see BankMix).
 */
function MixPadTile({ pad, index, engine, face, onOpen }: MixPadTileProps) {
  const looping = usePadLooping(engine, pad.id)
  return (
    <button
      type="button"
      className={['pad', 'mix-tile', looping ? 'looping' : '', pad.muted ? 'muted' : ''].filter(Boolean).join(' ')}
      data-pad-id={pad.id}
      data-pad-index={index}
      data-glow-pad={pad.id}
      onClick={onOpen}
      aria-label={`Pad ${index + 1}${pad.muted ? ', muted' : ''} — open its level, sound, trim and effects`}
    >
      <span className="pad-glow" aria-hidden="true" />
      <span className="pad-num" aria-hidden="true">{face.label?.primary ?? String(index + 1).padStart(2, '0')}</span>
      {face.icon && (
        <span className="pad-key" aria-hidden="true">
          <span className="pad-key-icon">{face.icon}</span>
        </span>
      )}
      <span className="mix-tile-level readout" aria-hidden="true">{pad.muted ? 'Muted' : `${pad.mixLevel}`}</span>
    </button>
  )
}

/**
 * Mix, for the bank on screen: one volume slider for all its pads (on top
 * of each pad's own level), the effects for all its pads, and room reserved
 * for a real mixer.
 */
function BankMix({ bank }: { bank: Bank }) {
  const { dispatch } = useAppState()
  const volume = bank.volume ?? 100
  return (
    <div className="bank-mix" role="group" aria-label={`${BANK_NAMES[bank.kind]} mix`}>
      <section className="edit-section" aria-label={`${BANK_NAMES[bank.kind]} volume`}>
        <header className="edit-section-head">
          <h3 className="label">{BANK_NAMES[bank.kind]} volume <span className="muted">· all pads</span></h3>
          <span className="readout edit-section-readout">{volume}%</span>
        </header>
        <input
          type="range"
          className="slider"
          style={{ '--fill': `${volume / 100}` } as React.CSSProperties}
          min={0}
          max={100}
          step={1}
          value={volume}
          onChange={(event) => dispatch({ type: 'SET_BANK_VOLUME', bankId: bank.id, level: Number(event.target.value) })}
          aria-label={`${BANK_NAMES[bank.kind]} volume, all pads`}
        />
      </section>
      <BankEffectsPanel />
      <div className="mixer-reserved" aria-label="Mixer (coming soon)">
        <span className="label label-dim">Mixer</span>
        <span className="muted">Coming soon — a proper mixing desk for your parts.</span>
      </div>
    </div>
  )
}
