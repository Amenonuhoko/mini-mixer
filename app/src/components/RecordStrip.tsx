import { useEffect, useRef } from 'react'
import type { AudioEngine } from '../engine/AudioEngine'
import { useAppState } from '../state/AppStateContext'

/**
 * While step record is armed: the whole sequence at a glance — one cell per
 * 16th, grouped into beats and bars, lit where anything is recorded, with
 * the cell being heard right now marked as the playhead.
 */
export function RecordStrip({ engine }: { engine: AudioEngine }) {
  const { state } = useAppState()
  const pattern = state.patterns.find((p) => p.id === state.activePatternId)
  const cellsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0
    let shown: number | null = null
    const tick = () => {
      const step = engine.getPlayheadStep()
      // Re-applied every frame: a re-render (a new hit lighting a cell) rewrites its class.
      const cells = cellsRef.current?.children
      if (cells) {
        if (shown !== null && shown !== step) cells[shown]?.classList.remove('now')
        if (step !== null) cells[step]?.classList.add('now')
      }
      shown = step
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [engine, pattern?.stepCount])

  if (!pattern) return null
  const count = pattern.stepCount
  const hits = Array.from({ length: count }, (_, i) =>
    Object.values(pattern.steps).reduce((n, row) => n + (row[i] ? 1 : 0), 0),
  )
  const beats = count / 4
  const bars = count / 16

  return (
    <div className="record-strip" aria-label="Recorded sequence">
      <div className="record-strip-head">
        <span className="record-strip-title">Sequence</span>
        <span className="readout">
          {bars} {bars === 1 ? 'bar' : 'bars'} · {beats} beats · {state.transport.bpm} BPM
        </span>
        {!state.transport.isPlaying && <span className="record-strip-hint">Press play to record</span>}
      </div>
      <div className="record-strip-cells" ref={cellsRef} style={{ '--steps': count } as React.CSSProperties}>
        {hits.map((n, i) => (
          <span
            key={i}
            className={['cell', n > 0 ? 'hit' : '', i % 4 === 0 ? 'beat' : '', i % 16 === 0 ? 'bar' : ''].filter(Boolean).join(' ')}
            title={`Beat ${Math.floor(i / 4) + 1}.${(i % 4) + 1}${n ? ` — ${n} sound${n > 1 ? 's' : ''}` : ''}`}
          />
        ))}
      </div>
    </div>
  )
}
