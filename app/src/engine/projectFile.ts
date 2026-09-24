import { DEFAULT_MIX_LEVEL, MAX_STEP_COUNT, MIN_STEP_COUNT } from '../state/constants'
import { computePeaks } from '../utils/waveform'
import { BANK_KINDS, createBank } from '../state/banks'
import { createId, DEFAULT_PERFORM } from '../state/defaults'
import { DEFAULT_KEY, DEFAULT_PAD_LABELS } from '../music/theory'
import { DEFAULT_INTENSITY, pickProgression } from '../styles/generator'
import { styleById } from '../styles/library'
import type {
  AppState,
  Bank,
  BankKind,
  CharacterPreset,
  LoopMode,
  MoodId,
  MusicalKey,
  PadLabelSettings,
  PadLayout,
  PerformSettings,
  Groove,
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
 *
 * Bank/key fields are optional because projects saved before pad banks carry
 * a flat pad list plus `visiblePadCount` instead — see stateFromMeta.
 */
export interface ProjectMeta {
  sampleOrder: string[]
  pads: Pad[]
  banks?: Bank[]
  activeBankId?: string
  key?: MusicalKey
  mood?: MoodId | null
  padLayout?: PadLayout
  padLabels?: PadLabelSettings
  perform?: PerformSettings
  groove?: Groove | null
  fxBySound?: Record<string, CharacterPreset>
  /** Legacy (pre-bank) projects only: how many of `pads` were showing. */
  visiblePadCount?: number
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
    padMixerModeEnabled: boolean
    playthroughRecordingEnabled: boolean
  }
}

export function extractProjectMeta(state: AppState): ProjectMeta {
  return {
    sampleOrder: state.sampleOrder,
    pads: state.pads,
    banks: state.banks,
    activeBankId: state.activeBankId,
    key: state.key,
    mood: state.mood,
    padLayout: state.padLayout,
    padLabels: state.padLabels,
    perform: state.perform,
    groove: state.groove,
    fxBySound: state.fxBySound,
    patterns: state.patterns,
    activePatternId: state.activePatternId,
    transport: {
      bpm: state.transport.bpm,
      loopMode: state.transport.loopMode,
      metronomeEnabled: state.transport.metronomeEnabled,
      masterVolume: state.transport.masterVolume,
      padPlaybackMode: state.transport.padPlaybackMode,
      padLoopModeEnabled: state.transport.padLoopModeEnabled,
      padMixerModeEnabled: state.transport.padMixerModeEnabled,
      playthroughRecordingEnabled: state.transport.playthroughRecordingEnabled,
    },
  }
}

/**
 * Older saved projects/autosave records predate `Pad.mixLevel` and `Pad.music`
 * — their pad objects come back from JSON with those fields simply missing,
 * which would leave arithmetic on mixLevel producing NaN. Shared between both
 * load paths so they can't drift.
 */
export function normalizePads(pads: Pad[]): Pad[] {
  return pads.map((pad) => ({ ...pad, mixLevel: pad.mixLevel ?? DEFAULT_MIX_LEVEL, music: pad.music ?? null }))
}

/**
 * Projects saved before pad banks had one flat pad grid. It becomes the Drums
 * bank (which doubles as the sampler, so recordings stay where they were) with
 * the same number of pads showing, alongside fresh empty melodic banks.
 */
export function normalizeBanks(meta: Pick<ProjectMeta, 'banks' | 'pads' | 'visiblePadCount'>): Bank[] {
  const padIds = new Set(meta.pads.map((pad) => pad.id))
  const saved = meta.banks
  if (saved && BANK_KINDS.every((kind) => saved.some((bank) => bank.kind === kind))) {
    return BANK_KINDS.map((kind) => {
      const bank = saved.find((candidate) => candidate.kind === kind)!
      const bankPadIds = bank.padIds.filter((id) => padIds.has(id))
      return {
        ...createBank(bank.id, kind, bankPadIds),
        ...bank,
        padIds: bankPadIds,
        visibleCount: Math.min(bank.visibleCount, bankPadIds.length),
      }
    })
  }
  const legacyIds = meta.pads.map((pad) => pad.id)
  return BANK_KINDS.map((kind) => {
    if (kind !== 'drums') return createBank(createId('bank'), kind)
    const bank = createBank(createId('bank'), kind, legacyIds)
    return { ...bank, visibleCount: Math.min(meta.visiblePadCount ?? legacyIds.length, legacyIds.length) }
  })
}

/**
 * Projects saved before sample snapshots used booleans in each sequencer cell.
 * Convert an old true cell to the pad sound it pointed at when loaded; new cells
 * already contain their immutable sample ids and pass through unchanged.
 */
export function normalizePatterns(patterns: Pattern[], pads: Pad[]): Pattern[] {
  const sampleIdByPad = new Map(pads.map((pad) => [pad.id, pad.sampleId]))
  return patterns.map((pattern) => {
    const longestRow = Math.max(MIN_STEP_COUNT, ...Object.values(pattern.steps).map((steps) => steps.length))
    const stepCount = Math.min(MAX_STEP_COUNT, Math.max(MIN_STEP_COUNT, pattern.stepCount ?? longestRow))
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

/** isPlaying is transient session state, not project data — always reset. */
export function buildTransport(meta: ProjectMeta['transport']): Transport {
  return {
    bpm: meta.bpm,
    loopMode: meta.loopMode,
    metronomeEnabled: meta.metronomeEnabled,
    padLoopModeEnabled: meta.padLoopModeEnabled ?? false,
    // Older saved projects/autosave records predate these — default them in.
    masterVolume: meta.masterVolume ?? 100,
    padPlaybackMode: meta.padPlaybackMode ?? 'gate',
    padMixerModeEnabled: meta.padMixerModeEnabled ?? false,
    playthroughRecordingEnabled: meta.playthroughRecordingEnabled ?? false,
    isPlaying: false,
  }
}

/**
 * Phase 2 saved one style per beat (`{ styleId, seed, takes }`); now every
 * layer carries its own. An old beat becomes the same beat with every bank's
 * layer in that style — same seed, so the same progression.
 */
export function normalizeGroove(saved: unknown): Groove | null {
  if (!saved || typeof saved !== 'object') return null
  const value = saved as Partial<Groove> & { styleId?: string; takes?: Partial<Record<BankKind, number>> }
  if (value.layers && Array.isArray(value.progression) && typeof value.seed === 'number') return value as Groove
  const style = value.styleId ? styleById(value.styleId) : undefined
  if (!style || typeof value.seed !== 'number') return null
  return {
    seed: value.seed,
    bars: style.bars,
    progression: pickProgression(style, value.seed),
    layers: Object.fromEntries(
      BANK_KINDS.map((kind) => [kind, { styleId: style.id, take: value.takes?.[kind] ?? 0, intensity: DEFAULT_INTENSITY }]),
    ),
  }
}

/**
 * Rebuilds full app state from saved meta plus already-decoded samples — the
 * one place both load paths (project file, autosave) fill in defaults for
 * fields older saves lack, so they can't drift.
 */
export function stateFromMeta(meta: ProjectMeta, samples: Record<string, Sample>): AppState {
  const pads = normalizePads(meta.pads)
  const banks = normalizeBanks(meta)
  return {
    samples,
    sampleOrder: meta.sampleOrder,
    pads,
    banks,
    activeBankId: banks.some((bank) => bank.id === meta.activeBankId) ? meta.activeBankId! : banks[0]!.id,
    key: meta.key ?? DEFAULT_KEY,
    mood: meta.mood === undefined ? (meta.key ? null : 'bright') : meta.mood,
    padLayout: meta.padLayout ?? 'guided',
    padLabels: meta.padLabels ?? DEFAULT_PAD_LABELS,
    perform: { ...DEFAULT_PERFORM, ...meta.perform },
    groove: normalizeGroove(meta.groove),
    fxBySound: meta.fxBySound ?? {},
    patterns: normalizePatterns(meta.patterns, pads),
    activePatternId: meta.activePatternId,
    transport: buildTransport(meta.transport),
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
  return stateFromMeta(project, samples)
}
