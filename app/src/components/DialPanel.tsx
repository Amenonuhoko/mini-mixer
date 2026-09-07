import { usePadLooping } from '../hooks/usePadLooping'
import { EFFECT_IDS, EFFECT_MAX, EFFECT_MIN, EFFECT_STEP } from '../state/constants'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import type { EffectId } from '../state/types'
import { InfoTip } from './InfoTip'
import { WaveformTrimEditor } from './WaveformTrimEditor'

const EFFECT_LABELS: Record<EffectId, string> = {
  pitch: 'Pitch',
  speed: 'Speed',
  filter: 'Filter',
}

const EFFECT_DESCRIPTIONS: Record<EffectId, string> = {
  pitch:
    'Shifts the pitch up or down without changing playback speed. 0 is the original pitch, negative is lower, positive is higher.',
  speed:
    'Changes how fast the sample plays — and its pitch along with it, like slowing or speeding up a turntable. 0 is normal speed.',
  filter:
    'A tone control: negative muffles the sound (like turning down the treble), positive thins it out, 0 leaves it untouched.',
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

interface DialPanelProps {
  padId: string | null
}

export function DialPanel({ padId }: DialPanelProps) {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const padIndex = padId ? state.pads.findIndex((p) => p.id === padId) : -1
  const pad = padIndex >= 0 ? state.pads[padIndex] : undefined
  const looping = usePadLooping(engine, pad?.id ?? '')
  const sample = pad?.sampleId ? state.samples[pad.sampleId] : undefined

  return (
    <section className="panel dial-panel" aria-label="pad dials">
      <div className="dial-panel-header">
        <h2>Dials</h2>
        {pad && (
          <span className="dial-panel-target">
            <span className="tag" style={{ background: pad.color }}>
              Pad {padIndex + 1}
            </span>
            {looping && <span className="tag tag-live">live</span>}
          </span>
        )}
      </div>
      {!pad ? (
        <p className="muted">Tap a pad to tweak its sound.</p>
      ) : (
        <>
          {looping && (
            <p className="muted dial-panel-hint">
              This pad is looping — changes are audible instantly.
            </p>
          )}

          {sample && (
            <div className="trim-section">
              <div className="dial-label-row">
                <span className="dial-label-text">Trim</span>
                <InfoTip label="About Trim">
                  Drag the handles to choose which part of the recording this pad plays. Only
                  affects this pad — the same recording can be trimmed differently on other pads.
                </InfoTip>
              </div>
              <WaveformTrimEditor
                peaks={sample.peaks}
                trimStart={pad.trimStart}
                trimEnd={pad.trimEnd}
                color={pad.color}
                onChange={(trimStart, trimEnd) => {
                  dispatch({ type: 'SET_PAD_TRIM', padId: pad.id, trimStart, trimEnd })
                  if (looping) {
                    engine.updateLoopingPadTrim(pad.id, trimStart, trimEnd)
                  }
                }}
              />
              <div className="trim-footer">
                <span className="muted">
                  {formatSeconds((pad.trimEnd - pad.trimStart) * sample.buffer.duration)} selected
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    dispatch({ type: 'SET_PAD_TRIM', padId: pad.id, trimStart: 0, trimEnd: 1 })
                    if (looping) engine.updateLoopingPadTrim(pad.id, 0, 1)
                  }}
                >
                  Reset trim
                </button>
              </div>
            </div>
          )}

          {EFFECT_IDS.map((effectId) => {
            const setting = pad.effects.find((effect) => effect.id === effectId)
            const value = setting?.value ?? 0
            return (
              <div className="dial-row" key={effectId}>
                <div className="dial-label-row">
                  <label htmlFor={`dial-${effectId}`} className="dial-label-text">
                    {EFFECT_LABELS[effectId]}
                  </label>
                  <InfoTip label={`About ${EFFECT_LABELS[effectId]}`}>
                    {EFFECT_DESCRIPTIONS[effectId]}
                  </InfoTip>
                  <span className="dial-value">{formatValue(value)}</span>
                </div>
                <input
                  id={`dial-${effectId}`}
                  type="range"
                  className="dial-slider"
                  style={{ '--dial-color': pad.color } as React.CSSProperties}
                  min={EFFECT_MIN}
                  max={EFFECT_MAX}
                  step={EFFECT_STEP}
                  list={`dial-${effectId}-anchors`}
                  value={value}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value)
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
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => dispatch({ type: 'RESET_PAD_EFFECTS', padId: pad.id })}
          >
            Reset dials
          </button>
        </>
      )}
    </section>
  )
}
