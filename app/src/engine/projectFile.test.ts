import { describe, expect, it } from 'vitest'
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  encodeWav,
  isSerializedProject,
  type PcmSource,
} from './projectFile'

function makeSource(samples: number[], numberOfChannels = 1, sampleRate = 44100): PcmSource {
  return {
    numberOfChannels,
    sampleRate,
    length: samples.length,
    getChannelData: () => Float32Array.from(samples),
  }
}

describe('encodeWav', () => {
  it('writes a well-formed RIFF/WAVE header', () => {
    const bytes = encodeWav(makeSource([0, 0.5, -0.5, 1, -1]))
    const view = new DataView(bytes)
    const readAscii = (offset: number, length: number) =>
      String.fromCharCode(...new Uint8Array(bytes, offset, length))

    expect(readAscii(0, 4)).toBe('RIFF')
    expect(readAscii(8, 4)).toBe('WAVE')
    expect(readAscii(12, 4)).toBe('fmt ')
    expect(readAscii(36, 4)).toBe('data')
    expect(view.getUint16(20, true)).toBe(1) // PCM
    expect(view.getUint16(22, true)).toBe(1) // mono
    expect(view.getUint32(24, true)).toBe(44100)
    expect(view.getUint16(34, true)).toBe(16) // bits per sample
  })

  it('round-trips sample values within 16-bit quantization tolerance', () => {
    const original = [0, 0.5, -0.5, 0.9999, -1, 1]
    const bytes = encodeWav(makeSource(original))
    const view = new DataView(bytes)
    for (let i = 0; i < original.length; i++) {
      const int16 = view.getInt16(44 + i * 2, true)
      const decoded = int16 / (int16 < 0 ? 0x8000 : 0x7fff)
      expect(decoded).toBeCloseTo(original[i]!, 3)
    }
  })

  it('sizes the data chunk correctly for multi-channel buffers', () => {
    const source = makeSource([0.1, 0.2, 0.3, 0.4], 2)
    const bytes = encodeWav(source)
    const view = new DataView(bytes)
    // length is per-channel frame count in this helper's mock, 4 frames * 2 channels * 2 bytes
    expect(view.getUint32(40, true)).toBe(source.length * 2 * 2)
    expect(bytes.byteLength).toBe(44 + source.length * 2 * 2)
  })
})

describe('base64 round trip', () => {
  it('recovers the original bytes, including across a chunk boundary', () => {
    const original = new Uint8Array(0x8000 + 10)
    for (let i = 0; i < original.length; i++) original[i] = i % 256
    const base64 = arrayBufferToBase64(original.buffer)
    const recovered = new Uint8Array(base64ToArrayBuffer(base64))
    expect(Array.from(recovered)).toEqual(Array.from(original))
  })
})

describe('isSerializedProject', () => {
  const valid = {
    version: 1,
    savedAt: 0,
    sampleOrder: [],
    samples: [],
    pads: [],
    visiblePadCount: 8,
    patterns: [],
    activePatternId: 'pattern_1',
    transport: { bpm: 120, loopMode: 'continuous', metronomeEnabled: false },
  }

  it('accepts a well-formed project object', () => {
    expect(isSerializedProject(valid)).toBe(true)
  })

  it('rejects non-objects, wrong versions, and missing fields', () => {
    expect(isSerializedProject(null)).toBe(false)
    expect(isSerializedProject('a string')).toBe(false)
    expect(isSerializedProject({ ...valid, version: 2 })).toBe(false)
    expect(isSerializedProject({ ...valid, pads: 'not an array' })).toBe(false)
    const { transport: _transport, ...withoutTransport } = valid
    expect(isSerializedProject(withoutTransport)).toBe(false)
  })
})
