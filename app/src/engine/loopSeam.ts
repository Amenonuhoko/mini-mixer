/** How long the loop's end blends into what precedes its start. */
const CROSSFADE_SECONDS = 0.01
/** When nothing precedes the start (an untrimmed sample), the seam is faded out and back in over this long instead. */
const DECLICK_SECONDS = 0.003

/**
 * One loop cycle of `channels` — the samples from `start` to `end` — reworked
 * so the jump from its last sample back to its first is continuous. A plain
 * looping source jumps from wherever the waveform is at the loop end to
 * wherever it is at the start: a click on every cycle of every looping pad.
 *
 * If the sample has audio before `start` (a trimmed loop), the cycle's last
 * few milliseconds crossfade into exactly that audio, so the loop runs
 * straight into its own start with nothing to hear. Otherwise the seam dips
 * to silence for a few milliseconds. Either way the cycle keeps its exact
 * length, so looping pads stay in time with each other.
 */
export function seamlessCycle(channels: Float32Array[], start: number, end: number, sampleRate: number): Float32Array[] {
  const length = Math.max(1, end - start)
  const crossfade = Math.min(Math.round(CROSSFADE_SECONDS * sampleRate), Math.floor(length / 4))
  const declick = Math.min(Math.round(DECLICK_SECONDS * sampleRate), Math.floor(length / 4))
  return channels.map((data) => {
    const out = data.slice(start, start + length)
    if (crossfade > 0 && start >= crossfade) {
      for (let i = 0; i < crossfade; i++) {
        // Raised cosine: 0 → 1 across the fade, so the last sample is (almost) the one just before `start`.
        const t = 0.5 - 0.5 * Math.cos((Math.PI * (i + 1)) / crossfade)
        const at = length - crossfade + i
        out[at] = out[at]! * (1 - t) + data[start - crossfade + i]! * t
      }
    } else if (declick > 0) {
      for (let i = 0; i < declick; i++) {
        const gain = i / declick
        out[i] = out[i]! * gain
        out[length - 1 - i] = out[length - 1 - i]! * gain
      }
    }
    return out
  })
}

const cycles = new WeakMap<AudioBuffer, Map<string, AudioBuffer>>()

/** The seamless cycle of `buffer` between two times (seconds), built once per buffer and loop window. */
export function seamlessLoopBuffer(ctx: BaseAudioContext, buffer: AudioBuffer, startSeconds: number, endSeconds: number): AudioBuffer {
  const start = Math.max(0, Math.min(buffer.length - 1, Math.round(startSeconds * buffer.sampleRate)))
  const end = Math.max(start + 1, Math.min(buffer.length, Math.round(endSeconds * buffer.sampleRate)))
  const key = `${start}:${end}`
  let byWindow = cycles.get(buffer)
  const cached = byWindow?.get(key)
  if (cached) return cached
  const data = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
  const cycle = seamlessCycle(data, start, end, buffer.sampleRate)
  const result = ctx.createBuffer(cycle.length, end - start, buffer.sampleRate)
  cycle.forEach((channel, c) => result.copyToChannel(channel as Float32Array<ArrayBuffer>, c))
  if (!byWindow) {
    byWindow = new Map()
    cycles.set(buffer, byWindow)
  }
  byWindow.set(key, result)
  return result
}
