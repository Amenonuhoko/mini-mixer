import { DEFAULT_MIX_LEVEL, MAX_STEP_COUNT, STEP_COUNT } from '../state/constants'
import { computePeaks } from '../utils/waveform'
import type {
  AppState,
  Instrument,
  LoopMode,
  PadPlaybackMode,
  Pad,
  Pattern,
  Sample,
  SampleKind,
  SequenceTrace,
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
    /** Optional for backwards-compatible import of projects saved before this control. */
    masterVolume?: number
    /** Optional for backwards-compatible import of projects saved before this control. */
    padPlaybackMode?: PadPlaybackMode
    padLoopModeEnabled: boolean
    padInstrumentModeEnabled: boolean
    padMixerModeEnabled: boolean
    playthroughRecordingEnabled: boolean
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
      masterVolume: state.transport.masterVolume,
      padPlaybackMode: state.transport.padPlaybackMode,
      padLoopModeEnabled: state.transport.padLoopModeEnabled,
      padInstrumentModeEnabled: state.transport.padInstrumentModeEnabled,
      padMixerModeEnabled: state.transport.padMixerModeEnabled,
      playthroughRecordingEnabled: state.transport.playthroughRecordingEnabled,
    },
  }
}

/**
 * Older saved projects/autosave records predate `Pad.mixLevel` — their pad
 * objects come back from JSON with that field simply missing, which (unlike
 * a missing boolean, which reads as falsy anyway) would leave arithmetic on
 * it producing NaN. Shared between both load paths so they can't drift.
 */
export function normalizePads(pads: Pad[]): Pad[] {
  return pads.map((pad) => ({ ...pad, mixLevel: pad.mixLevel ?? DEFAULT_MIX_LEVEL }))
}

/**
 * Projects saved before sample snapshots used booleans in each sequencer cell.
 * Convert an old true cell to the pad sound it pointed at when loaded; new cells
 * already contain their immutable sample ids and pass through unchanged.
 */
export function normalizePatterns(patterns: Pattern[], pads: Pad[]): Pattern[] {
  const sampleIdByPad = new Map(pads.map((pad) => [pad.id, pad.sampleId]))
  return patterns.map((pattern) => {
    const longestRow = Math.max(STEP_COUNT, ...Object.values(pattern.steps).map((steps) => steps.length))
    const stepCount = Math.min(MAX_STEP_COUNT, Math.max(STEP_COUNT, pattern.stepCount ?? longestRow))
    return {
      ...pattern,
      stepCount,
      traceSteps: pattern.traceSteps ?? null,
      traceSource: pattern.traceSource ?? (pattern.traceSteps ? 'reference' : null),
      steps: Object.fromEntries(
        Object.entries(pattern.steps).map(([padId, rawSteps]) => {
          const legacySteps = rawSteps as unknown as Array<string | boolean | null | undefined>
          return [
            padId,
            Array.from({ length: stepCount }, (_, stepIndex) => {
              const step = legacySteps[stepIndex]
              if (typeof step === 'string') return step
              return step === true ? sampleIdByPad.get(padId) ?? null : null
            }),
          ]
        }),
      ),
    }
  })
}

/**
 * isPlaying/currentStep/autoInstrumentId/autoInstrumentPadSnapshot are transient session state, not
 * project data — always reset. autoInstrumentId in particular: once a
 * project has been explicitly saved, any instrument it contains is project
 * data now, not something still owed InstrumentModeButton's silent
 * auto-delete-on-off (see Transport.autoInstrumentId).
 */
export function buildTransport(meta: ProjectMeta['transport']): Transport {
  return {
    ...meta,
    // Older saved projects/autosave records predate these — default them in.
    masterVolume: meta.masterVolume ?? 100,
    padPlaybackMode: meta.padPlaybackMode ?? 'gate',
    padInstrumentModeEnabled: meta.padInstrumentModeEnabled ?? false,
    padMixerModeEnabled: meta.padMixerModeEnabled ?? false,
    playthroughRecordingEnabled: meta.playthroughRecordingEnabled ?? false,
    isPlaying: false,
    currentStep: 0,
    autoInstrumentId: null,
    autoInstrumentPadSnapshot: null,
  }
}

export function buildSample(
  id: string,
  label: string,
  recordedAt: number,
  buffer: AudioBuffer,
  kind: SampleKind = 'recording',
): Sample {
  return { id, label, recordedAt, kind, buffer, peaks: computePeaks(buffer, WAVEFORM_BUCKETS) }
}

export interface SerializedSample {
  id: string
  label: string
  recordedAt: number
  kind: SampleKind
  sequenceTrace?: SequenceTrace
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
        kind: sample.kind,
        ...(sample.sequenceTrace ? { sequenceTrace: sample.sequenceTrace } : {}),
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
    // Older saved files predate the kind field — default to 'recording'.
    samples[s.id] = { ...buildSample(s.id, s.label, s.recordedAt, buffer, s.kind ?? 'recording'), ...(s.sequenceTrace ? { sequenceTrace: s.sequenceTrace } : {}) }
  }
  return {
    samples,
    sampleOrder: project.sampleOrder,
    // Older saved projects/files predate instruments — default them in rather
    // than requiring every saved project to have carried the field.
    instruments: project.instruments ?? {},
    instrumentOrder: project.instrumentOrder ?? [],
    pads: normalizePads(project.pads),
    visiblePadCount: project.visiblePadCount,
    patterns: normalizePatterns(project.patterns, normalizePads(project.pads)),
    activePatternId: project.activePatternId,
    transport: buildTransport(project.transport),
  }
}
