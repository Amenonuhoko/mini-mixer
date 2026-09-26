import { useEffect, useRef, useState } from 'react'
import { usePadLooping } from '../hooks/usePadLooping'
import { usePadPlaying } from '../hooks/usePadPlaying'
import { EFFECT_IDS, EFFECT_MAX, EFFECT_MIN, EFFECT_PRESETS, EFFECT_STEP, MIN_PAD_COUNT } from '../state/constants'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import { useNavigation } from '../state/NavigationContext'
import type { EffectId } from '../state/types'
import { EffectsSwitch } from './EffectsSwitch'
import { ConfirmDialog } from './ConfirmDialog'
import { LoopIcon, MuteIcon, SwapIcon, TrashIcon } from './icons'
import { InfoTip } from './InfoTip'
import { dialToSemitones, formatSemitones, semitonesToDial } from '../engine/dialMapping'
import { PadLibraryPicker } from './PadLibraryPicker'
import { WaveformTrimEditor } from './WaveformTrimEditor'
import { bankOfPad } from '../state/banks'

const EFFECT_LABELS: Record<EffectId, string> = {
  pitch: 'Pitch',
  speed: 'Speed',
  filter: 'Filter',
  volume: 'Volume',
  pan: 'Pan',
  grit: 'Grit',
  echo: 'Echo',
  reverb: 'Reverb',
}

const EFFECT_DESCRIPTIONS: Record<EffectId, string> = {
  pitch:
    'Shifts the pitch up or down without changing playback speed. 0 is the original pitch, negative is lower, positive is higher.',
  speed:
    'Changes how fast the sample plays — and its pitch along with it, like slowing or speeding up a turntable. 0 is normal speed.',
  filter:
    'A tone control: negative muffles the sound (like turning down the treble), positive thins it out, 0 leaves it untouched.',
  volume:
    "Turns this pad up or down on its own. 0 is normal volume, -100 is silent, +100 is a loud boost that can distort if you push it — that's a feature, not a bug.",
  pan: 'Places the sound left or right in stereo. 0 is centered, negative moves it left, positive moves it right.',
  grit: 'A character dial: negative crushes the sound into a harsh, digital lo-fi crunch, positive drives it into warm analog-style saturation. 0 is clean.',
  echo: 'Adds a repeating echo: negative is a tight, quick slapback, positive is a longer, spacier delay. 0 is dry, no echo at all.',
  reverb:
    'Adds room ambience: negative is a small, tight space, positive is a large, spacious hall. 0 is dry, no reverb at all.',
}

/** Anchor points the dial snaps to, e.g. [-100, -75, -50, ... 100]. */
const EFFECT_ANCHORS: number[] = []
for (let v = EFFECT_MIN; v <= EFFECT_MAX; v += EFFECT_STEP) EFFECT_ANCHORS.push(v)

function formatValue(value: number): string {
  if (value === 0) return '0'
  return value > 0 ? `+${value}` : String(value)
}

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(2)}s`
}

/**
 * One pad in the Mix sheet (see PadEditOverlay): its level and sound (mute,
 * and on Drums swap or remove), loop-to-audition, trim, and effects with
 * their on/off switch. Every change dispatches immediately, so there's
 * nothing "unsaved" to lose by dismissing at any point.
 */
export function PadEditPage() {
  const { editingPadId, goBackFromEdit } = useNavigation()
  const [sheet, setSheet] = useState<'swap' | 'remove' | null>(null)
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const pad = state.pads.find((p) => p.id === editingPadId)
  const looping = usePadLooping(engine, editingPadId ?? '')
  const playing = usePadPlaying(engine, editingPadId ?? '')
  const sample = pad?.sampleId ? state.samples[pad.sampleId] : undefined

  useEffect(() => {
    if (!pad) goBackFromEdit()
  }, [pad, goBackFromEdit])

  // Looping a pad here is for auditioning it while dialing things in, not a
  // performance you meant to leave running — closing the editor (the X, the
  // backdrop, or switching to a different pad's edit view) always stops it,
  // regardless of which of those closed it. A ref keeps the cleanup reading
  // the latest pad/looping state rather than whatever it was at mount.
  const stopOnCloseRef = useRef({ engine, padId: editingPadId, looping })
  useEffect(() => {
    stopOnCloseRef.current = { engine, padId: editingPadId, looping }
  }, [engine, editingPadId, looping])
  useEffect(() => {
    return () => {
      const { engine: currentEngine, padId, looping: wasLooping } = stopOnCloseRef.current
      if (wasLooping && padId) currentEngine.stopPad(padId)
    }
  }, [])

  const handleToggleLoop = () => {
    if (!pad?.sampleId || !sample) return
    if (pad.muted && !looping) return
    engine.toggleLoop(pad, sample.buffer)
  }

  const handleToggleEffects = () => {
    const bypassed = !pad?.effectsBypassed
    dispatch({ type: 'SET_PAD_EFFECTS_BYPASSED', padId: pad!.id, bypassed })
    if (looping) {
      engine.updateLoopingPadEffectsBypass(pad!.id, { ...pad!, effectsBypassed: bypassed })
    }
  }

  if (!pad) return null
  const padBank = bankOfPad(state, pad.id)
  const drums = padBank?.kind === 'drums'

  const setLevel = (level: number) => {
    dispatch({ type: 'SET_PAD_MIX_LEVEL', padId: pad.id, level })
    engine.updateLoopingPadMixLevel(pad.id, level)
  }

  return (
    <div className="edit-pad">
      <section className="edit-section mix-level" aria-label="Level and sound">
        <header className="edit-section-head">
          <h3 className="label">Level</h3>
          <span className="readout edit-section-readout">{pad.muted ? 'Muted' : `${pad.mixLevel}%`}</span>
        </header>
        <input
          type="range"
          className="slider"
          style={{ '--fill': `${pad.mixLevel / 100}` } as React.CSSProperties}
          min={0}
          max={100}
          step={1}
          value={pad.mixLevel}
          onChange={(event) => setLevel(Number(event.target.value))}
          aria-label="Pad level"
        />
        <div className="mix-sound-actions">
          <button
            type="button"
            className={pad.muted ? 'btn on-warn' : 'btn'}
            onClick={() => dispatch({ type: 'SET_PAD_MUTED', padId: pad.id, muted: !pad.muted })}
            aria-pressed={pad.muted}
          >
            <MuteIcon muted={pad.muted} size={16} />
            {pad.muted ? 'Muted' : 'Mute'}
          </button>
          {drums && (
            <button type="button" className="btn" onClick={() => setSheet('swap')} title="Swap in another sound from the library">
              <SwapIcon size={16} />
              Swap sound
            </button>
          )}
          {drums && padBank.padIds.length > MIN_PAD_COUNT && (
            <button type="button" className="btn btn-danger" onClick={() => setSheet('remove')}>
              <TrashIcon size={16} />
              Remove pad
            </button>
          )}
        </div>
      </section>
      {sheet === 'swap' && <PadLibraryPicker padId={pad.id} onClose={() => setSheet(null)} />}
      {sheet === 'remove' && (
        <ConfirmDialog
          message="Remove this pad? Its programmed steps go with it — its sample stays in the library, and every other pad is unaffected."
          confirmLabel="Remove"
          onConfirm={() => {
            setSheet(null)
            dispatch({ type: 'REMOVE_PAD', padId: pad.id })
          }}
          onCancel={() => setSheet(null)}
        />
      )}
      <button
        type="button"
        className={looping ? 'btn btn-block on-warn' : 'btn btn-block'}
        onClick={handleToggleLoop}
        disabled={!pad.sampleId}
        aria-pressed={looping}
      >
        <LoopIcon size={16} />
        {looping ? 'Stop loop' : playing ? 'Playing — loop it' : 'Loop to audition'}
      </button>
      {looping && <p className="hint">Looping — every change is audible instantly.</p>}

      {sample && (
        <section className="edit-section" aria-label="Trim">
          <header className="edit-section-head">
            <h3 className="label">Trim</h3>
            <InfoTip label="About Trim">
              Drag the handles to choose which part of the recording this pad plays. Only affects
              this pad — the same recording can be trimmed differently on other pads.
            </InfoTip>
            <span className="readout edit-section-readout">
              {formatSeconds((pad.trimEnd - pad.trimStart) * sample.buffer.duration)}
            </span>
          </header>
          <WaveformTrimEditor
            peaks={sample.peaks}
            trimStart={pad.trimStart}
            trimEnd={pad.trimEnd}
            onChange={(trimStart, trimEnd) => {
              dispatch({ type: 'SET_PAD_TRIM', padId: pad.id, trimStart, trimEnd })
              if (looping) {
                engine.updateLoopingPadTrim(pad.id, trimStart, trimEnd)
              }
            }}
          />
          <button
            type="button"
            className="btn btn-sm edit-section-reset"
            onClick={() => {
              dispatch({ type: 'SET_PAD_TRIM', padId: pad.id, trimStart: 0, trimEnd: 1 })
              if (looping) engine.updateLoopingPadTrim(pad.id, 0, 1)
            }}
          >
            Reset trim
          </button>
        </section>
      )}

      <section className="edit-section" aria-label="Effects">
        <header className="edit-section-head">
          <h3 className="label">Effects</h3>
          <EffectsSwitch bypassed={pad.effectsBypassed} onToggle={handleToggleEffects} />
        </header>
        <div className="edit-section-sub">
          <span className="label label-dim">Presets</span>
          <InfoTip label="About presets">
            Quick-start combos across Filter, Grit, Echo, and Reverb — the character dials.
            Applying one only changes those four; Pitch, Speed, Volume, and Pan are left as they
            are.
          </InfoTip>
        </div>
        <div className="chip-row">
          {EFFECT_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              className="chip-btn"
              onClick={() => {
                for (const effectId of ['filter', 'grit', 'echo', 'reverb'] as const) {
                  const value = preset[effectId]
                  dispatch({ type: 'SET_PAD_EFFECT', padId: pad.id, effectId, value })
                  if (looping) engine.updateLoopingPadEffect(pad.id, effectId, value)
                }
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
        <div className={pad.effectsBypassed ? 'dials bypassed' : 'dials'}>
          {EFFECT_IDS.map((effectId) => {
            const setting = pad.effects.find((effect) => effect.id === effectId)
            const value = setting?.value ?? 0
            // Pitch counts whole semitones (±12 = an octave); the other dials snap to their anchors.
            const pitchDial = effectId === 'pitch'
            return (
              <div className="dial-row" key={effectId}>
                <div className="dial-label-row">
                  <label htmlFor={`dial-${effectId}`} className="dial-label-text">
                    {EFFECT_LABELS[effectId]}
                  </label>
                  <InfoTip label={`About ${EFFECT_LABELS[effectId]}`}>
                    {EFFECT_DESCRIPTIONS[effectId]}
                  </InfoTip>
                  <span className={value === 0 ? 'dial-value' : 'dial-value active'}>{pitchDial ? formatSemitones(value) : formatValue(value)}</span>
                </div>
                <input
                  id={`dial-${effectId}`}
                  type="range"
                  className="slider bipolar"
                  style={{ '--fill': `${(value - EFFECT_MIN) / (EFFECT_MAX - EFFECT_MIN)}` } as React.CSSProperties}
                  min={pitchDial ? -12 : EFFECT_MIN}
                  max={pitchDial ? 12 : EFFECT_MAX}
                  step={pitchDial ? 1 : EFFECT_STEP}
                  list={pitchDial ? undefined : `dial-${effectId}-anchors`}
                  value={pitchDial ? dialToSemitones(value) : value}
                  onChange={(event) => {
                    const nextValue = pitchDial ? semitonesToDial(Number(event.target.value)) : Number(event.target.value)
                    dispatch({ type: 'SET_PAD_EFFECT', padId: pad.id, effectId, value: nextValue })
                    if (looping) {
                      engine.updateLoopingPadEffect(pad.id, effectId, nextValue)
                    }
                  }}
                />
                <datalist id={`dial-${effectId}-anchors`}>
                  {EFFECT_ANCHORS.map((anchor) => (
                    <option key={anchor} value={anchor} />
                  ))}
                </datalist>
              </div>
            )
          })}
        </div>
        <button
          type="button"
          className="btn btn-sm edit-section-reset"
          onClick={() => dispatch({ type: 'RESET_PAD_EFFECTS', padId: pad.id })}
        >
          Reset dials
        </button>
      </section>
    </div>
  )
}
