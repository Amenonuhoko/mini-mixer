/** Remove DC, soften cut edges, and level every channel together to preserve stereo balance. */
export function polishSample(buffer: AudioBuffer, targetRms = 0.14, ceiling = 0.8): AudioBuffer {
  let energy = 0
  let peak = 0
  const attack = Math.max(1, Math.min(Math.floor(buffer.length / 2), Math.round(buffer.sampleRate * 0.0015)))
  const release = Math.max(1, Math.min(Math.floor(buffer.length / 2), Math.round(buffer.sampleRate * 0.025)))
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    let mean = 0
    for (const value of data) mean += value
    mean /= Math.max(1, data.length)
    for (let i = 0; i < data.length; i++) {
      const edge = Math.min(1, i / attack, (data.length - 1 - i) / release)
      const value = (data[i]! - mean) * Math.max(0, edge)
      data[i] = value
      energy += value * value
      peak = Math.max(peak, Math.abs(value))
    }
  }
  const rms = Math.sqrt(energy / Math.max(1, buffer.length * buffer.numberOfChannels))
  if (!rms || !peak) return buffer
  const gain = Math.min(targetRms / rms, ceiling / peak)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < data.length; i++) data[i] = data[i]! * gain
  }
  return buffer
}
