export interface PlaybackWindow {
  /** Seconds into the buffer to start playback (or the start of each loop pass). */
  offset: number
  /** Seconds to play before stopping — only meaningful for a one-shot. */
  duration: number
  /** Seconds — where a looping source should return to on each pass. */
  loopStart: number
  /** Seconds — where a looping source should wrap. */
  loopEnd: number
}

/**
 * Converts a pad's (trimStart, trimEnd) — fractions 0-1 of the sample's duration —
 * into the actual second offsets AudioBufferSourceNode's playback API wants.
 * Pure and buffer-free so it's testable without an AudioContext.
 */
export function trimToPlaybackWindow(
  trimStart: number,
  trimEnd: number,
  durationSeconds: number,
): PlaybackWindow {
  const offset = trimStart * durationSeconds
  const loopEnd = trimEnd * durationSeconds
  return {
    offset,
    duration: Math.max(0, loopEnd - offset),
    loopStart: offset,
    loopEnd,
  }
}
