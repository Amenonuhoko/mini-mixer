import { useEffect, useRef } from 'react'
import { useEngine } from '../state/EngineContext'

/** Per-frame multiplier on a decaying level — fast attack, ~150ms visual release at 60fps. */
const RELEASE = 0.86
/** Skip DOM writes smaller than this; nobody can see a 0.3% brightness change. */
const WRITE_EPSILON = 0.004

const BLOOM_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(0.94)', opacity: 1 },
  { transform: 'scale(1.42)', opacity: 0 },
]
const FLASH_KEYFRAMES: Keyframe[] = [{ opacity: 1 }, { opacity: 0 }]

/**
 * The light show: one requestAnimationFrame loop that reads the audio engine's
 * meters and beat clock and writes the results straight onto the DOM as CSS
 * custom properties, which index.css turns into glow. Deliberately outside
 * React's render cycle — re-rendering the pad grid 60 times a second would
 * cost far more than the light show is worth, while a handful of
 * style.setProperty calls per frame is nearly free.
 *
 * Writes are scoped on purpose: a custom property set on :root invalidates
 * style for the whole document every frame, so values go only onto the
 * elements that use them — each `[data-glow-pad]` element (pads and their
 * sequencer row chips) gets --level/--beat, `[data-beat]` indicators get
 * --beat, and the fixed background layer this component renders gets the
 * scene-wide --scene/--beat.
 *
 * Hit bloom uses the Web Animations API on each pad's own bloom/flash layers,
 * timed to the audio clock so a sequencer step (scheduled ~100ms ahead)
 * flashes when it's heard, not when it's queued.
 */
export function LightShow() {
  const engine = useEngine()
  const fieldRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const levels = new Map<string, number>()
    const written = new WeakMap<HTMLElement, { level: number; beat: number }>()
    let scene = 0
    let lastScene = -1
    let lastFieldBeat = -1
    let frame = 0

    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (document.hidden) return

      const { phase, locked } = engine.getBeatPhase()
      // A sharp swell on each downbeat that decays through the beat — reads as
      // a pulse rather than a sine wobble. Weaker while free-running, so an
      // idle screen breathes gently and a playing one actually thumps.
      const beat = reducedMotion.matches ? 0 : Math.pow(1 - phase, 3) * (locked ? 1 : 0.3)

      for (const el of document.querySelectorAll<HTMLElement>('[data-glow-pad]')) {
        const padId = el.dataset.glowPad!
        const raw = engine.getPadLevel(padId)
        const previous = levels.get(padId) ?? 0
        const level = raw >= previous ? raw : Math.max(raw, previous * RELEASE)
        levels.set(padId, level)

        const last = written.get(el)
        if (!last || Math.abs(last.level - level) > WRITE_EPSILON || Math.abs(last.beat - beat) > WRITE_EPSILON) {
          el.style.setProperty('--level', level.toFixed(3))
          el.style.setProperty('--beat', beat.toFixed(3))
          written.set(el, { level, beat })
        }
      }

      if (Math.abs(beat - lastFieldBeat) > WRITE_EPSILON) {
        for (const el of document.querySelectorAll<HTMLElement>('[data-beat]')) {
          el.style.setProperty('--beat', beat.toFixed(3))
        }
      }

      const master = engine.getMasterLevel()
      scene = master >= scene ? master : Math.max(master, scene * RELEASE)
      const field = fieldRef.current
      if (field) {
        if (Math.abs(scene - lastScene) > WRITE_EPSILON) {
          field.style.setProperty('--scene', scene.toFixed(3))
          lastScene = scene
        }
        if (Math.abs(beat - lastFieldBeat) > WRITE_EPSILON) {
          field.style.setProperty('--beat', beat.toFixed(3))
          lastFieldBeat = beat
        }
      }
    }
    frame = requestAnimationFrame(tick)

    const bloom = (padId: string) => {
      for (const el of document.querySelectorAll<HTMLElement>(`[data-glow-pad="${CSS.escape(padId)}"]`)) {
        el.querySelector<HTMLElement>('.pad-flash')?.animate(FLASH_KEYFRAMES, {
          duration: reducedMotion.matches ? 160 : 280,
          easing: 'ease-out',
        })
        if (!reducedMotion.matches) {
          el.querySelector<HTMLElement>('.pad-bloom')?.animate(BLOOM_KEYFRAMES, {
            duration: 520,
            easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
          })
        }
      }
    }

    const timers = new Set<number>()
    const unsubscribe = engine.onPadHit((padId, when) => {
      const now = engine.getAudioTime() ?? when
      const delayMs = Math.max(0, (when - now) * 1000)
      if (delayMs < 4) {
        bloom(padId)
        return
      }
      const timer = window.setTimeout(() => {
        timers.delete(timer)
        bloom(padId)
      }, delayMs)
      timers.add(timer)
    })

    return () => {
      cancelAnimationFrame(frame)
      unsubscribe()
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [engine])

  return <div ref={fieldRef} className="light-field" aria-hidden="true" />
}
