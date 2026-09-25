import { useCallback, useEffect, useRef, useState } from 'react'
import { useDismiss } from '../hooks/useDismiss'
import { BPM_MAX, BPM_MIN } from '../state/constants'
import { clampBpm, holdStep, nowMs, scaleBpm, tapTempo, TEMPO_FEEL, TEMPO_PRESETS } from '../utils/tempo'

interface TempoControlProps {
  bpm: number
  onChange: (bpm: number) => void
}

/**
 * Tempo, fast in every direction:
 *
 * - − / + step one BPM per tap, and **hold to run** — repeating, speeding
 *   up, and after a moment jumping in fives that snap to round numbers.
 * - **Drag** the number to sweep (right / up is faster).
 * - **Tap** the number for the tempo panel: a full-range slider, ±1/5/10
 *   steps, half-time / double-time, common tempos in one tap, and tap tempo.
 *
 * Every feel number (hold delay, repeat speed, drag sensitivity…) lives in
 * TEMPO_FEEL (utils/tempo.ts). Tempo changes are live — a playing beat just
 * speeds up or slows down.
 */
export function TempoControl({ bpm, onChange }: TempoControlProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  useDismiss(anchorRef, open, useCallback(() => setOpen(false), []))

  // The latest tempo, for held buttons and drags that outlive a render.
  const bpmRef = useRef(bpm)
  useEffect(() => {
    bpmRef.current = bpm
  }, [bpm])
  const set = useCallback(
    (next: number) => {
      const value = clampBpm(next)
      if (value === bpmRef.current) return
      bpmRef.current = value
      onChange(value)
    },
    [onChange],
  )

  // --- Hold to run -------------------------------------------------------
  const holdTimer = useRef<number | null>(null)
  const stopHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
    holdTimer.current = null
  }
  useEffect(() => stopHold, [])

  const startHold = (event: React.PointerEvent<HTMLButtonElement>, direction: 1 | -1) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    stopHold()
    const pressedAt = nowMs()
    let interval = TEMPO_FEEL.repeatStartMs
    set(bpmRef.current + direction)
    const repeat = () => {
      const held = nowMs() - pressedAt
      set(holdStep(bpmRef.current, direction, held))
      // Fine steps speed up; coarse jumps keep a steady pace you can stop on.
      interval = held >= TEMPO_FEEL.coarseAfterMs ? TEMPO_FEEL.coarseIntervalMs : Math.max(TEMPO_FEEL.repeatMinMs, interval * TEMPO_FEEL.repeatAccel)
      holdTimer.current = window.setTimeout(repeat, interval)
    }
    holdTimer.current = window.setTimeout(repeat, TEMPO_FEEL.holdDelayMs)
  }

  const nudgeProps = (direction: 1 | -1) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => startHold(event, direction),
    onPointerUp: stopHold,
    onPointerCancel: stopHold,
    onLostPointerCapture: stopHold,
    // Pointer presses are handled above; a click with no pointer is the keyboard.
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      if (event.detail === 0) set(bpmRef.current + direction)
    },
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  })

  // --- Drag the number, or tap it for the panel ---------------------------
  const scrubRef = useRef<{ startX: number; startY: number; startBpm: number; moved: boolean } | null>(null)

  const handlePointerDown = (event: React.PointerEvent<HTMLOutputElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    scrubRef.current = { startX: event.clientX, startY: event.clientY, startBpm: bpmRef.current, moved: false }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLOutputElement>) => {
    const scrub = scrubRef.current
    if (!scrub) return
    const dx = event.clientX - scrub.startX
    const dy = event.clientY - scrub.startY
    if (!scrub.moved && Math.hypot(dx, dy) < TEMPO_FEEL.tapSlopPx) return
    scrub.moved = true
    set(scrub.startBpm + (dx - dy) / TEMPO_FEEL.scrubPxPerBpm)
  }

  const handlePointerUp = () => {
    const scrub = scrubRef.current
    scrubRef.current = null
    if (scrub && !scrub.moved) setOpen((current) => !current)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLOutputElement>) => {
    const step = event.shiftKey ? 10 : 1
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault()
      set(bpmRef.current + step)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault()
      set(bpmRef.current - step)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen((current) => !current)
    }
  }

  // --- Tap tempo -----------------------------------------------------------
  const tapsRef = useRef<number[]>([])
  const [tapping, setTapping] = useState(false)
  const handleTap = () => {
    const now = nowMs()
    const taps = tapsRef.current
    if (taps.length > 0 && now - taps[taps.length - 1]! > TEMPO_FEEL.tapResetMs) taps.length = 0
    taps.push(now)
    setTapping(taps.length === 1)
    const tapped = tapTempo(taps)
    if (tapped !== null) set(tapped)
  }

  return (
    <div className="bpm-control popover-anchor" role="group" aria-label="Tempo" ref={anchorRef}>
      <button type="button" className="bpm-nudge" disabled={bpm <= BPM_MIN} aria-label="Slower — hold to run" {...nudgeProps(-1)}>
        −
      </button>
      <output
        className={open ? 'bpm-readout open' : 'bpm-readout'}
        tabIndex={0}
        role="slider"
        aria-label="Tempo in BPM — drag, use arrow keys, or tap for more"
        aria-valuemin={BPM_MIN}
        aria-valuemax={BPM_MAX}
        aria-valuenow={bpm}
        aria-expanded={open}
        title="Drag to change tempo · tap for more"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => (scrubRef.current = null)}
        onKeyDown={handleKeyDown}
      >
        <span className="bpm-value">{bpm}</span>
        <span className="bpm-unit">BPM</span>
      </output>
      <button type="button" className="bpm-nudge" disabled={bpm >= BPM_MAX} aria-label="Faster — hold to run" {...nudgeProps(1)}>
        +
      </button>

      {open && (
        <div className="popover tempo-popover" role="dialog" aria-label="Tempo">
          <div className="tempo-popover-head">
            <span className="label">Tempo</span>
            <span className="tempo-popover-value readout">{bpm}</span>
          </div>
          <input
            type="range"
            className="slider"
            style={{ '--fill': `${(bpm - BPM_MIN) / (BPM_MAX - BPM_MIN)}` } as React.CSSProperties}
            min={BPM_MIN}
            max={BPM_MAX}
            step="1"
            value={bpm}
            onChange={(event) => set(Number(event.target.value))}
            aria-label="Tempo"
          />
          <div className="tempo-steps" role="group" aria-label="Step the tempo">
            {[-10, -5, -1, 1, 5, 10].map((step) => (
              <button key={step} type="button" className="chip-btn" onClick={() => set(bpmRef.current + step)}>
                {step > 0 ? `+${step}` : `−${-step}`}
              </button>
            ))}
          </div>
          <div className="tempo-steps" role="group" aria-label="Half, double, or tap">
            <button type="button" className="chip-btn" onClick={() => set(scaleBpm(bpmRef.current, 0.5))} title="Half-time">
              ½×
            </button>
            <button type="button" className="chip-btn" onClick={() => set(scaleBpm(bpmRef.current, 2))} title="Double-time">
              2×
            </button>
            <button type="button" className={tapping ? 'chip-btn on tempo-tap' : 'chip-btn tempo-tap'} onClick={handleTap} title="Tap along to set the tempo">
              {tapping ? 'Tap again…' : 'Tap'}
            </button>
          </div>
          <div className="tempo-presets" role="group" aria-label="Common tempos">
            {TEMPO_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={preset === bpm ? 'chip-btn on' : 'chip-btn'}
                onClick={() => set(preset)}
                aria-pressed={preset === bpm}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
