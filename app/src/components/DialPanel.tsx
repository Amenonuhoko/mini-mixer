import { EFFECT_IDS } from '../state/constants'
import { useAppState } from '../state/AppStateContext'
import type { EffectId } from '../state/types'

const EFFECT_LABELS: Record<EffectId, string> = {
  pitch: 'Pitch',
  speed: 'Speed',
  filter: 'Filter',
}

interface DialPanelProps {
  padId: string | null
}

export function DialPanel({ padId }: DialPanelProps) {
  const { state, dispatch } = useAppState()
  const pad = padId ? state.pads.find((p) => p.id === padId) : undefined

  return (
    <section className="panel dial-panel" aria-label="pad dials">
      <h2>Dials</h2>
      {!pad ? (
        <p className="muted">Select a pad to tweak its sound.</p>
      ) : (
        <>
          {EFFECT_IDS.map((effectId) => {
            const setting = pad.effects.find((effect) => effect.id === effectId)
            const value = setting?.value ?? 50
            return (
              <div className="dial-row" key={effectId}>
                <label htmlFor={`dial-${effectId}`}>
                  {EFFECT_LABELS[effectId]}: {value}%
                </label>
                <input
                  id={`dial-${effectId}`}
                  type="range"
                  min={0}
                  max={100}
                  value={value}
                  onChange={(event) =>
                    dispatch({
                      type: 'SET_PAD_EFFECT',
                      padId: pad.id,
                      effectId,
                      value: Number(event.target.value),
                    })
                  }
                />
              </div>
            )
          })}
          <button
            type="button"
            onClick={() => dispatch({ type: 'RESET_PAD_EFFECTS', padId: pad.id })}
          >
            Reset dials
          </button>
        </>
      )}
    </section>
  )
}
