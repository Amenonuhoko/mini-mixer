import { computePeaks } from '../utils/waveform'
import type {
  AppState,
  Instrument,
  LoopMode,
  Pad,
  Pattern,
  Sample,
  Transport,
} from '../state/types'
import type { AudioEngine } from './AudioEngine'

/** Matches the resolution RecordFAB uses for its own waveform thumbnails. */
const WAVEFORM_BUCKETS = 80

/**
 * Structural subset of AudioBuffer this module actually needs — decoupled from
 * the DOM type so encodeWav is testable with a plain mock object, no real
 * AudioContext/AudioBuffer required (jsdom doesn't implement Web Audio).
 */
export interface PcmSource {
  numberOfChannels: number
  sampleRate: number
  length: number
  getChannelData(channel: number): Float32Array
}

/**
 * Encodes a decoded sample as 16-bit PCM WAV bytes — no library needed, and
 * AudioContext.decodeAudioData reads WAV natively, so the same engine method
 * already used for recordings (engine.decodeSample) handles the return trip
 * with no new decode path.
 */
export function encodeWav(buffer: PcmSource): ArrayBuffer {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const numFrames = buffer.length
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const dataSize = numFrames * blockAlign
  const arrayBuffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(arrayBuffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  const channels: Float32Array[] = []
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c))

  let offset = 44
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const clamped = Math.max(-1, Math.min(1, channels[c]![i] ?? 0))
      view.setInt16(offset, Math.round(clamped * (clamped < 0 ? 0x8000 : 0x7fff)), true)
      offset += 2
    }
  }
  return arrayBuffer
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000 // avoid a single huge call to String.fromCharCode
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/**
 * The non-audio parts of a project — shared between the downloadable-file
 * format and the IndexedDB autosave record, which differ only in how they
 * carry the actual audio bytes (base64-in-JSON vs a raw ArrayBuffer).
 */
export interface ProjectMeta {
  sampleOrder: string[]
  instruments: Record<string, Instrument>
  instrumentOrder: string[]
  pads: Pad[]
  visiblePadCount: number
  patterns: Pattern[]
  activePatternId: string
  transport: {
    bpm: number
    loopMode: LoopMode
    metronomeEnabled: boolean
    padLoopModeEnabled: boolean
  }
}

export function extractProjectMeta(state: AppState): ProjectMeta {
  return {
    sampleOrder: state.sampleOrder,
    instruments: state.instruments,
    instrumentOrder: state.instrumentOrder,
    pads: state.pads,
    visiblePadCount: state.visiblePadCount,
    patterns: state.patterns,
    activePatternId: state.activePatternId,
    transport: {
      bpm: state.transport.bpm,
      loopMode: state.transport.loopMode,
      metronomeEnabled: state.transport.metronomeEnabled,
      padLoopModeEnabled: state.transport.padLoopModeEnabled,
    },
  }
}

/** isPlaying/currentStep are transient playback state, not project data — always reset. */
export function buildTransport(meta: ProjectMeta['transport']): Transport {
  return { ...meta, isPlaying: false, currentStep: 0 }
}

export function buildSample(
  id: string,
  label: string,
  recordedAt: number,
  buffer: AudioBuffer,
): Sample {
  return { id, label, recordedAt, buffer, peaks: computePeaks(buffer, WAVEFORM_BUCKETS) }
}

export interface SerializedSample {
  id: string
  label: string
  recordedAt: number
  audioBase64: string
}

export interface SerializedProject extends ProjectMeta {
  version: 1
  savedAt: number
  samples: SerializedSample[]
}

export function serializeProject(state: AppState, savedAt: number): SerializedProject {
  return {
    version: 1,
    savedAt,
    ...extractProjectMeta(state),
    samples: state.sampleOrder
      .map((id) => state.samples[id])
      .filter((sample): sample is Sample => sample != null)
      .map((sample) => ({
        id: sample.id,
        label: sample.label,
        recordedAt: sample.recordedAt,
        audioBase64: arrayBufferToBase64(encodeWav(sample.buffer)),
      })),
  }
}

export function isSerializedProject(value: unknown): value is SerializedProject {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.version === 1 &&
    Array.isArray(v.sampleOrder) &&
    Array.isArray(v.samples) &&
    Array.isArray(v.pads) &&
    Array.isArray(v.patterns) &&
    typeof v.activePatternId === 'string' &&
    typeof v.visiblePadCount === 'number' &&
    typeof v.transport === 'object' &&
    v.transport !== null
  )
}

export async function deserializeProject(
  project: SerializedProject,
  engine: AudioEngine,
): Promise<AppState> {
  const samples: Record<string, Sample> = {}
  for (const s of project.samples) {
    const buffer = await engine.decodeSample(base64ToArrayBuffer(s.audioBase64))
    samples[s.id] = buildSample(s.id, s.label, s.recordedAt, buffer)
  }
  return {
    samples,
    sampleOrder: project.sampleOrder,
    // Older saved projects/files predate instruments — default them in rather
    // than requiring every saved project to have carried the field.
    instruments: project.instruments ?? {},
    instrumentOrder: project.instrumentOrder ?? [],
    pads: project.pads,
    visiblePadCount: project.visiblePadCount,
    patterns: project.patterns,
    activePatternId: project.activePatternId,
    transport: buildTransport(project.transport),
  }
}
