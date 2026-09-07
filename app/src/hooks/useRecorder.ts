import { useCallback, useRef, useState, type RefObject } from 'react'

interface UseRecorderResult {
  isRecording: boolean
  error: string | null
  /** Live analyser node while recording — null otherwise. For LiveWaveform to draw from directly. */
  analyserRef: RefObject<AnalyserNode | null>
  start: () => Promise<void>
  /** Resolves with the recorded audio once MediaRecorder has fully flushed. */
  stop: () => Promise<ArrayBuffer>
}

/**
 * Wraps MediaRecorder + exposes a live AnalyserNode for a waveform visualizer.
 * No max length — the caller decides when to stop. Kept out of AudioEngine since
 * it's a capture concern, not playback.
 */
export function useRecorder(): UseRecorderResult {
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const meterCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

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
    analyser.fftSize = 1024
    source.connect(analyser)
    analyserRef.current = analyser
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
          analyserRef.current = null
          void meterCtxRef.current?.close()
          meterCtxRef.current = null
          setIsRecording(false)
          resolve(arrayBuffer)
        })()
      }
      mediaRecorder.stop()
    })
  }, [])

  return { isRecording, error, analyserRef, start, stop }
}
