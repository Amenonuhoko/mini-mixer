/** Safari's Audio Session API (iOS 17+): which kind of audio this page makes. */
type AudioSessionType = 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record'

function setSession(type: AudioSessionType): void {
  const session = (navigator as Navigator & { audioSession?: { type: AudioSessionType } }).audioSession
  if (!session) return
  try {
    session.type = type
  } catch {
    // Not settable right now — keep whatever the browser chose.
  }
}

/**
 * Music playback. On iOS, once the microphone has been opened the page is
 * left in a record-capable session — quieter, lower quality output that
 * crackles — until something asks for playback again. Set when audio first
 * starts and again after every recording.
 */
export function preferPlaybackSession(): void {
  setSession('playback')
}

/** Recording from the microphone (with playback still going on). */
export function preferRecordingSession(): void {
  setSession('play-and-record')
}
