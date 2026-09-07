import { useEffect, useRef, useState } from 'react'

/** Seconds elapsed since `active` most recently became true; resets to 0 when it goes false. */
export function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0)
  const startRef = useRef(0)

  useEffect(() => {
    if (!active) return
    startRef.current = Date.now()
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startRef.current) / 1000))
    }, 250)
    return () => clearInterval(id)
  }, [active])

  // Derived rather than reset via an extra setState: 0 whenever inactive,
  // regardless of whatever the interval last wrote from a previous recording.
  return active ? seconds : 0
}

export function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
