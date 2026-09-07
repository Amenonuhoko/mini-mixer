import { useEffect, useRef, type RefObject } from 'react'

interface StaticWaveformProps {
  peaks: number[]
  color: string
}

/** Small bar-chart thumbnail from precomputed peaks — used in the library and the assign prompt. */
export function StaticWaveform({ peaks, color }: StaticWaveformProps) {
  if (peaks.length === 0) return null
  return (
    <svg
      viewBox={`0 0 ${peaks.length} 24`}
      preserveAspectRatio="none"
      className="static-waveform"
      aria-hidden="true"
    >
      {peaks.map((peak, i) => {
        const height = Math.max(1, peak * 24)
        return <rect key={i} x={i} y={(24 - height) / 2} width={0.7} height={height} fill={color} />
      })}
    </svg>
  )
}

interface LiveWaveformProps {
  analyserRef: RefObject<AnalyserNode | null>
  active: boolean
}

/**
 * Draws a scrolling live waveform straight from an AnalyserNode via its own
 * requestAnimationFrame loop — deliberately bypasses React state/re-renders for
 * the per-frame data, since pushing 60fps sample data through setState would be
 * wasteful and janky. Only `active` (a plain boolean) is a React-visible prop.
 */
export function LiveWaveform({ analyserRef, active }: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const data = new Uint8Array(analyser.frequencyBinCount)
    let rafId: number

    const draw = () => {
      analyser.getByteTimeDomainData(data)
      const { width, height } = canvas
      ctx.clearRect(0, 0, width, height)
      ctx.beginPath()
      const sliceWidth = width / data.length
      let x = 0
      for (let i = 0; i < data.length; i++) {
        const normalized = (data[i]! - 128) / 128
        const y = height / 2 + normalized * (height / 2 - 2)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
        x += sliceWidth
      }
      ctx.strokeStyle = '#e0555a'
      ctx.lineWidth = 2
      ctx.stroke()
      rafId = requestAnimationFrame(draw)
    }
    draw()

    return () => cancelAnimationFrame(rafId)
  }, [active, analyserRef])

  return <canvas ref={canvasRef} className="live-waveform" width={300} height={56} />
}
