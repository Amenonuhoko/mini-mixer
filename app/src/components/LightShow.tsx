import { useEffect, useRef } from 'react'
import { useAppState } from '../state/AppStateContext'
import { getActiveBank } from '../state/banks'
import { useEngine } from '../state/EngineContext'

/** Per-frame multiplier on a decaying level — fast attack, ~150ms visual release at 60fps. */
const RELEASE = 0.86
/** The floor lingers a touch longer than a pad, so a kick reads as a thump with weight rather than a blink. */
const FLOOR_RELEASE = 0.9
/** Skip DOM writes smaller than this; nobody can see a 0.3% brightness change. */
const WRITE_EPSILON = 0.004
/** Beats in a bar, for the bar counter in the transport strip. */
const BEATS_PER_BAR = 4
/** Steps in a beat: the playhead counts 16ths. */
const STEPS_PER_BEAT = 4

const BLOOM_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(0.94)', opacity: 1 },
  { transform: 'scale(1.42)', opacity: 0 },
]
const FLASH_KEYFRAMES: Keyframe[] = [{ opacity: 1 }, { opacity: 0 }]

/**
 * The light show: one requestAnimationFrame loop that reads the audio engine's
 * meters and beat clock and writes the results straight onto the DOM.
 * Deliberately outside React's render cycle — re-rendering the pad grid 60
 * times a second would cost far more than the light show is worth.
 *
 * Every write is a plain `opacity` on a layer that exists only to glow (each
 * pad's `.pad-glow`, each sequencer row's `.row-glow`, the bar counter's
 * LEDs, Play's halo, the background floor, mesh and shaft), and only when it
 * moved enough to see. The compositor fades those without restyling anything
 * else. An earlier version wrote CSS custom properties instead, which made
 * the browser restyle every pad each frame and starved the sequencer's timer
 * on phones (dropped and late notes). The playhead is marked here too
 * (`data-playhead` on the column being heard), rather than through React
 * state on every step, and the beam that sweeps the grid is moved once per
 * step with a Web Animations transform, so between steps it costs nothing.
 *
 * The background listens in three bands rather than to loudness alone: the
 * floor thumps with the kick and bass, the hex mesh breathes with the body
 * of the mix, the shaft from above lifts with the hats. Colour comes from
 * CSS: each bank's light is a `--bank-rgb` its elements inherit, and the
 * field takes the active bank's, so the stage is lit by the instrument in
 * hand.
 *
 * Hit bloom uses the Web Animations API on each pad's own bloom/flash layers,
 * timed to the audio clock so a sequencer step (scheduled ~100ms ahead)
 * flashes when it's heard, not when it's queued.
 */
export function LightShow() {
  const engine = useEngine()
  const { state } = useAppState()
  const fieldRef = useRef<HTMLDivElement>(null)
  const bankKind = getActiveBank(state).kind

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const levels = new Map<string, number>()
    const written = new WeakMap<HTMLElement, number>()
    const glowLayers = new WeakMap<HTMLElement, HTMLElement | null>()
    /** Writes an opacity only when it moved enough to see. */
    const setOpacity = (el: HTMLElement, value: number) => {
      const last = written.get(el)
      if (last !== undefined && Math.abs(last - value) <= WRITE_EPSILON) return
      el.style.opacity = value.toFixed(3)
      written.set(el, value)
    }
    const frameInterval = window.matchMedia('(pointer: coarse)').matches ? 1000 / 30 : 1000 / 60
    let lastFrame = 0
    let scene = 0
    let floor = 0
    let body = 0
    let air = 0
    let frame = 0
    let playhead: number | null = null
    let playheadCells: HTMLElement[] = []
    // The bar counter: which beat of the bar is sounding. Read off the
    // playhead while the sequencer runs; otherwise counted each time the
    // free-running beat wraps, so the idle strip still walks 1-2-3-4.
    let beatInBar = 0
    let lastPhase = 0
    // The beam: where it stands (px into the grid) and the glide in progress.
    let beamX: number | null = null
    let beamGlide: Animation | null = null

    // The glowing elements, looked up again only when the page's structure
    // changes — not with a document-wide query every frame.
    let glowEls: HTMLElement[] = []
    let beatEls: HTMLElement[] = []
    let haloEls: HTMLElement[] = []
    let beam: HTMLElement | null = null
    let stale = true
    const observer = new MutationObserver(() => {
      stale = true
    })
    observer.observe(document.body, { childList: true, subtree: true })

    const field = fieldRef.current
    const mesh = field?.querySelector<HTMLElement>('.light-field-mesh') ?? null
    const shaft = field?.querySelector<HTMLElement>('.light-field-shaft') ?? null
    const floorEl = field?.querySelector<HTMLElement>('.light-field-floor') ?? null

    /** Moves the beam to the column being heard: a glide over one step when it's the next column along, a jump otherwise (bar wrap, a new pattern, first step). */
    const moveBeam = (cell: HTMLElement | null) => {
      if (!beam) return
      if (!cell) {
        beamGlide?.cancel()
        beamGlide = null
        beamX = null
        setOpacity(beam, 0)
        return
      }
      // One layout read per step (the grid is the beam's offset parent).
      const x = cell.offsetLeft
      const from = beamX
      beamGlide?.cancel()
      // Glide only to a neighbouring column (a group gap is still a neighbour).
      const glides = from !== null && x > from && x - from < cell.offsetWidth * 2.5 && !reducedMotion.matches
      beamGlide = beam.animate(
        [{ transform: `translateX(${from ?? x}px)` }, { transform: `translateX(${x}px)` }],
        { duration: glides ? engine.getStepSeconds() * 1000 : 0, easing: 'linear', fill: 'forwards' },
      )
      beamX = x
    }

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (document.hidden || now - lastFrame < frameInterval - 1) return
      const frames = Math.min(100, now - lastFrame) / (1000 / 60)
      const release = Math.pow(RELEASE, frames)
      const floorRelease = Math.pow(FLOOR_RELEASE, frames)
      lastFrame = now

      const { phase, locked } = engine.getBeatPhase()
      // A sharp swell on each downbeat that decays through the beat — reads as
      // a pulse rather than a sine wobble. Weaker while free-running, so an
      // idle screen breathes gently and a playing one actually thumps.
      const beat = reducedMotion.matches ? 0 : Math.pow(1 - phase, 3) * (locked ? 1 : 0.3)

      // One meter read per pad per frame (a pad and its sequencer row share it),
      // and none at all for pads that are silent and already dark.
      const frameLevels = new Map<string, number>()
      const levelOf = (padId: string) => {
        let level = frameLevels.get(padId)
        if (level === undefined) {
          const previous = levels.get(padId) ?? 0
          const raw = engine.isPadPlaying(padId) || previous > 0.002 ? engine.getPadLevel(padId) : 0
          level = raw >= previous ? raw : Math.max(raw, previous * release)
          if (level < 0.002) level = 0
          levels.set(padId, level)
          frameLevels.set(padId, level)
        }
        return level
      }

      // Glow layers get a plain opacity, written straight onto the layer: the
      // compositor fades it without restyling anything else — the whole
      // reason the light show can run every frame alongside the audio.
      if (stale) {
        glowEls = [...document.querySelectorAll<HTMLElement>('[data-glow-pad]')]
        beatEls = [...document.querySelectorAll<HTMLElement>('[data-beat]')]
        haloEls = [...document.querySelectorAll<HTMLElement>('[data-beat-halo]')]
        const nextBeam = document.querySelector<HTMLElement>('.sequencer-grid .playhead-beam')
        if (nextBeam !== beam) {
          beam = nextBeam
          beamX = null
          beamGlide = null
        }
        stale = false
        playhead = null // re-mark the playhead on any new cells
      }

      for (const el of glowEls) {
        let glow = glowLayers.get(el)
        if (glow === undefined) {
          glow = el.querySelector<HTMLElement>('.pad-glow, .row-glow')
          glowLayers.set(el, glow)
        }
        if (!glow) continue
        const level = levelOf(el.dataset.glowPad!)
        // Looping pads also breathe with the beat.
        const opacity = el.classList.contains('looping') ? Math.min(1, 0.2 + beat * 0.55 + level * 0.5) : level
        setOpacity(glow, opacity)
      }

      // The playhead marks the step being heard right now, straight on the
      // DOM — no React render per step, and in time with the audio rather
      // than with the scheduler running ~100 ms ahead. The beam follows it.
      const step = engine.getPlayheadStep()
      if (step !== playhead) {
        for (const cell of playheadCells) cell.removeAttribute('data-playhead')
        playheadCells = step === null ? [] : [...document.querySelectorAll<HTMLElement>(`.sequencer-grid [data-step-index="${step}"]`)]
        for (const cell of playheadCells) cell.setAttribute('data-playhead', '')
        moveBeam(playheadCells[0] ?? null)
        playhead = step
      }
      if (beam && step !== null) setOpacity(beam, 0.75 + beat * 0.25)

      // The bar counter walks 1-2-3-4 with the sequencer, or with the idle beat.
      if (step !== null) beatInBar = Math.floor(step / STEPS_PER_BEAT) % BEATS_PER_BAR
      else if (phase < lastPhase) beatInBar = (beatInBar + 1) % BEATS_PER_BAR
      lastPhase = phase
      for (const el of beatEls) {
        const which = el.dataset.beat
        const current = !which || Number(which) === beatInBar
        setOpacity(el, current ? 0.3 + beat * 0.7 : 0.12)
      }

      // Play's halo thumps only when something is actually keeping time.
      for (const el of haloEls) setOpacity(el, locked ? beat * 0.9 : 0)

      // The room. Loudness swells the shaft; the three bands each light their
      // own layer, with a fast attack and their own release.
      const master = engine.getMasterLevel()
      scene = master >= scene ? master : Math.max(master, scene * release)
      const bands = engine.getMasterBands()
      floor = bands.low >= floor ? bands.low : Math.max(bands.low, floor * floorRelease)
      body = bands.mid >= body ? bands.mid : Math.max(bands.mid, body * release)
      air = bands.high >= air ? bands.high : Math.max(bands.high, air * release)
      if (mesh) setOpacity(mesh, 0.14 + beat * 0.06 + body * 0.22)
      if (shaft) setOpacity(shaft, 0.5 + scene * 0.2 + air * 0.35 + beat * 0.08)
      if (floorEl) setOpacity(floorEl, (locked ? 0.08 : 0.04) + beat * 0.08 + floor * 0.8)
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
      observer.disconnect()
      unsubscribe()
      beamGlide?.cancel()
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [engine])

  return (
    <div ref={fieldRef} className={`light-field bank-${bankKind}`} aria-hidden="true">
      <div className="light-field-mesh" />
      <div className="light-field-shaft" />
      <div className="light-field-floor" />
    </div>
  )
}
