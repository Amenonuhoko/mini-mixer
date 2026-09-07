import { useCallback, useRef, useState } from 'react'

interface UseRecorderResult {
  isRecording: boolean
  /** 0-1 RMS level of the live mic input, for a level meter. */
  level: number
  error: string | null
  start: () => Promise<void>
  /** Resolves with the recorded audio once MediaRecorder has fully flushed. */
  stop: () => Promise<ArrayBuffer>
}

/**
 * Wraps MediaRecorder + a live level meter. No max length — the caller decides
 * when to stop. Kept out of AudioEngine since it's a capture concern, not playback.
 */
export function useRecorder(): UseRecorderResult {
  const [isRecording, setIsRecording] = useState(false)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const meterCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)

  const stopLevelMeter = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    void meterCtxRef.current?.close()
    meterCtxRef.current = null
    setLevel(0)
  }, [])

  const start = useCallback(async () => {
    setError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Microphone access was denied or is unavailable.')
      throw new Error('mic-permission-denied')
    }
    streamRef.current = stream
    chunksRef.current = []

    const mediaRecorder = new MediaRecorder(stream)
    mediaRecorderRef.current = mediaRecorder
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    mediaRecorder.start()
    setIsRecording(true)

    const meterCtx = new AudioContext()
    meterCtxRef.current = meterCtx
    const source = meterCtx.createMediaStreamSource(stream)
    const analyser = meterCtx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)

    const tick = () => {
      analyser.getByteTimeDomainData(data)
      let sumSquares = 0
      for (const sample of data) {
        const normalized = (sample - 128) / 128
        sumSquares += normalized * normalized
      }
      setLevel(Math.sqrt(sumSquares / data.length))
      rafRef.current = requestAnimationFrame(tick)
    }
    tick()
  }, [])

  const stop = useCallback((): Promise<ArrayBuffer> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current
      if (!mediaRecorder) {
        resolve(new ArrayBuffer(0))
        return
      }
      mediaRecorder.onstop = () => {
        void (async () => {
          const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType })
          const arrayBuffer = await blob.arrayBuffer()
          streamRef.current?.getTracks().forEach((track) => track.stop())
          streamRef.current = null
          stopLevelMeter()
          setIsRecording(false)
          resolve(arrayBuffer)
        })()
      }
      mediaRecorder.stop()
    })
  }, [stopLevelMeter])

  return { isRecording, level, error, start, stop }
}
