import { useEffect, useRef } from 'react'
import { StaticWaveform } from './Waveform'

interface WaveformTrimEditorProps {
  peaks: number[]
  trimStart: number
  trimEnd: number
  color: string
  onChange: (trimStart: number, trimEnd: number) => void
}

/**
 * Drag-to-trim over the sample's waveform. Non-destructive — this only ever
 * produces fractions (0-1) for the caller to store; the underlying buffer is
 * never touched. Uses window-level pointermove/up (not per-element pointer
 * capture) so dragging still tracks correctly if the finger/cursor slips off
 * the small handle target.
 */
export function WaveformTrimEditor({
  peaks,
  trimStart,
  trimEnd,
  color,
  onChange,
}: WaveformTrimEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<'start' | 'end' | null>(null)
  const latestRef = useRef({ trimStart, trimEnd, onChange })

  // Keeping this in sync via an effect (not a direct mutation during render)
  // is what makes it safe to read from the window-level pointer handlers below.
  useEffect(() => {
    latestRef.current = { trimStart, trimEnd, onChange }
  })

  useEffect(() => {
    const fractionFromClientX = (clientX: number): number => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return 0
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    }

    const handleMove = (event: PointerEvent) => {
      const dragging = draggingRef.current
      if (!dragging) return
      const fraction = fractionFromClientX(event.clientX)
      const {
        trimStart: currentStart,
        trimEnd: currentEnd,
        onChange: currentOnChange,
      } = latestRef.current
      if (dragging === 'start') {
        currentOnChange(fraction, currentEnd)
      } else {
        currentOnChange(currentStart, fraction)
      }
    }
    const handleUp = () => {
      draggingRef.current = null
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [])

  return (
    <div className="trim-editor" ref={containerRef}>
      <StaticWaveform peaks={peaks} color={color} />
      <div className="trim-dim trim-dim-left" style={{ width: `${trimStart * 100}%` }} />
      <div className="trim-dim trim-dim-right" style={{ width: `${(1 - trimEnd) * 100}%` }} />
      <button
        type="button"
        className="trim-handle trim-handle-start"
        style={{ left: `${trimStart * 100}%` }}
        onPointerDown={(event) => {
          event.preventDefault()
          draggingRef.current = 'start'
        }}
        aria-label="Trim start"
      />
      <button
        type="button"
        className="trim-handle trim-handle-end"
        style={{ left: `${trimEnd * 100}%` }}
        onPointerDown={(event) => {
          event.preventDefault()
          draggingRef.current = 'end'
        }}
        aria-label="Trim end"
      />
    </div>
  )
}
