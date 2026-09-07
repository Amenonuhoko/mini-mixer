import { usePadLooping } from '../hooks/usePadLooping'
import { EFFECT_IDS, EFFECT_MAX, EFFECT_MIN, EFFECT_STEP } from '../state/constants'
import { useAppState } from '../state/AppStateContext'
import { useEngine } from '../state/EngineContext'
import type { EffectId } from '../state/types'

const EFFECT_LABELS: Record<EffectId, string> = {
  pitch: 'Pitch',
  speed: 'Speed',
  filter: 'Filter',
}

/** Anchor points the dial snaps to, e.g. [-100, -75, -50, ... 100]. */
const EFFECT_ANCHORS: number[] = []
for (let v = EFFECT_MIN; v <= EFFECT_MAX; v += EFFECT_STEP) EFFECT_ANCHORS.push(v)

function formatValue(value: number): string {
  if (value === 0) return '0'
  return value > 0 ? `+${value}` : String(value)
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
          {EFFECT_IDS.map((effectId) => {
            const setting = pad.effects.find((effect) => effect.id === effectId)
            const value = setting?.value ?? 0
            return (
              <div className="dial-row" key={effectId}>
                <label htmlFor={`dial-${effectId}`}>
                  {EFFECT_LABELS[effectId]}: {formatValue(value)}
                </label>
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
