/**
 * Sample audio as 16-bit PCM, for the autosave store: half the bytes of the
 * floats the engine plays, written once per sample and read back on every
 * launch — so a phone restores a session in half the time and holds half
 * as much while it does. The recordings were 16-bit to begin with, and
 * the rounding (−96 dB) sits far below anything a rendered note carries.
 */
export function encodePcm16(data: Float32Array): Int16Array<ArrayBuffer> {
  const out = new Int16Array(data.length)
  for (let i = 0; i < data.length; i++) {
    const value = data[i]!
    out[i] = value <= -1 ? -32768 : value >= 1 ? 32767 : Math.round(value * 32767)
  }
  return out
}

export function decodePcm16(data: Int16Array): Float32Array<ArrayBuffer> {
  const out = new Float32Array(data.length)
  for (let i = 0; i < data.length; i++) out[i] = Math.max(-1, data[i]! / 32767)
  return out
}
