/**
 * Downsamples an AudioBuffer into peak amplitudes (0-1) for a static waveform
 * thumbnail. Computed once when a sample is recorded, not on every render —
 * a several-second recording can be hundreds of thousands of samples.
 */
export function computePeaks(buffer: AudioBuffer, bucketCount: number): number[] {
  const channelData = buffer.getChannelData(0)
  const bucketSize = Math.max(1, Math.floor(channelData.length / bucketCount))
  const peaks: number[] = []
  for (let i = 0; i < bucketCount; i++) {
    const start = i * bucketSize
    const end = Math.min(channelData.length, start + bucketSize)
    let max = 0
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j] ?? 0)
      if (abs > max) max = abs
    }
    peaks.push(max)
  }
  return peaks
}
