import type { AudioEngine } from '../engine/AudioEngine'
import { buildSample, extractProjectMeta, stateFromMeta, type ProjectMeta } from '../engine/projectFile'
import type { AppState, Sample, SampleKind, SequenceTrace } from './types'

const DB_NAME = 'mini-mixer'
const DB_VERSION = 2
const META_STORE = 'autosave'
const SAMPLE_STORE = 'samples'
const SNAPSHOT_KEY = 'session'
/** Samples written per transaction — small enough that no single write stalls a frame. */
const SAMPLES_PER_BATCH = 6

/** The session minus its audio: small, rewritten on every change. */
interface AutosaveMeta extends ProjectMeta {
  savedAt: number
  /** Which samples the session uses, in library order — each lives in the samples store under its id. */
  sampleIds: string[]
}

/** One sample's audio as raw PCM — copied, never encoded, so saving and restoring are cheap. */
interface StoredSample {
  id: string
  label: string
  recordedAt: number
  kind: SampleKind
  sequenceTrace?: SequenceTrace
  sampleRate: number
  channels: Array<Float32Array<ArrayBuffer>>
}

/** The version-1 record: one object holding every sample as WAV bytes. Still readable, never written. */
interface LegacyRecord extends ProjectMeta {
  samples: Array<{ id: string; label: string; recordedAt: number; kind: SampleKind; sequenceTrace?: SequenceTrace; audio: ArrayBuffer }>
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE)
      if (!db.objectStoreNames.contains(SAMPLE_STORE)) db.createObjectStore(SAMPLE_STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error as Error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error as Error)
    tx.onabort = () => reject(tx.error as Error)
  })
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error as Error)
  })
}

/** Yields to the browser between batches, so saving never competes with a frame or the sequencer's timer. */
function idle(): Promise<void> {
  return new Promise((resolve) => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(() => resolve(), { timeout: 500 })
    else setTimeout(resolve, 16)
  })
}

function toStored(sample: Sample): StoredSample {
  return {
    id: sample.id,
    label: sample.label,
    recordedAt: sample.recordedAt,
    kind: sample.kind,
    ...(sample.sequenceTrace ? { sequenceTrace: sample.sequenceTrace } : {}),
    sampleRate: sample.buffer.sampleRate,
    channels: Array.from({ length: sample.buffer.numberOfChannels }, (_, c) => sample.buffer.getChannelData(c)),
  }
}

/** Sample ids known to be in the samples store — so a save only writes what's new. */
let storedIds: Set<string> | null = null
/** Saves run one at a time; a save requested meanwhile runs after, with the latest state. */
let saving: Promise<void> = Promise.resolve()
let pending: AppState | null = null

/**
 * Autosaves the session. The session record (pads, banks, patterns…) is
 * small and rewritten each time; samples are immutable, so each is written
 * once — as raw PCM, in small batches between frames — and deleted when the
 * session no longer uses it. A starter beat's hundred-odd rendered notes
 * therefore cost one quiet background write, not a re-encode of the whole
 * library on every edit (which used to freeze the page and starve the
 * sequencer).
 */
export function saveAutosave(state: AppState): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve()
  const queued = pending !== null
  pending = state
  if (queued) return saving
  saving = saving.then(async () => {
    const latest = pending
    pending = null
    if (latest) await writeSession(latest)
  })
  return saving
}

async function writeSession(state: AppState): Promise<void> {
  const db = await openDb()
  try {
    if (!storedIds) {
      const tx = db.transaction(SAMPLE_STORE, 'readonly')
      storedIds = new Set((await request(tx.objectStore(SAMPLE_STORE).getAllKeys())) as string[])
    }
    const known = storedIds

    const fresh = state.sampleOrder.map((id) => state.samples[id]).filter((sample): sample is Sample => !!sample && !known.has(sample.id))
    for (let i = 0; i < fresh.length; i += SAMPLES_PER_BATCH) {
      if (i > 0) await idle()
      const batch = fresh.slice(i, i + SAMPLES_PER_BATCH)
      const tx = db.transaction(SAMPLE_STORE, 'readwrite')
      for (const sample of batch) tx.objectStore(SAMPLE_STORE).put(toStored(sample))
      await done(tx)
      for (const sample of batch) known.add(sample.id)
    }

    // The session record last, so it never points at samples that aren't stored yet.
    const meta: AutosaveMeta = { savedAt: Date.now(), ...extractProjectMeta(state), sampleIds: state.sampleOrder }
    const inUse = new Set(state.sampleOrder)
    const stale = [...known].filter((id) => !inUse.has(id))
    const tx = db.transaction([META_STORE, SAMPLE_STORE], 'readwrite')
    tx.objectStore(META_STORE).put(meta, SNAPSHOT_KEY)
    for (const id of stale) tx.objectStore(SAMPLE_STORE).delete(id)
    await done(tx)
    for (const id of stale) known.delete(id)
  } finally {
    db.close()
  }
}

export async function loadAutosave(engine: AudioEngine): Promise<AppState | null> {
  if (typeof indexedDB === 'undefined') return null
  const db = await openDb()
  try {
    // Both reads are issued up front, in one transaction, before anything awaits.
    const tx = db.transaction([META_STORE, SAMPLE_STORE], 'readonly')
    const recordRequest = tx.objectStore(META_STORE).get(SNAPSHOT_KEY)
    const samplesRequest = tx.objectStore(SAMPLE_STORE).getAll()
    const [record, stored] = (await Promise.all([request(recordRequest), request(samplesRequest)])) as [
      AutosaveMeta | LegacyRecord | undefined,
      StoredSample[],
    ]
    if (!record) return null

    const samples: Record<string, Sample> = {}
    if ('sampleIds' in record) {
      const byId = new Map(stored.map((sample) => [sample.id, sample]))
      const ctx = engine.getContext()
      for (const id of record.sampleIds) {
        const s = byId.get(id)
        if (!s) continue
        const buffer = ctx.createBuffer(s.channels.length, s.channels[0]?.length ?? 1, s.sampleRate)
        s.channels.forEach((data, c) => buffer.copyToChannel(data, c))
        samples[id] = { ...buildSample(s.id, s.label, s.recordedAt, buffer, s.kind), ...(s.sequenceTrace ? { sequenceTrace: s.sequenceTrace } : {}) }
      }
      storedIds = new Set(byId.keys())
    } else {
      // Version-1 autosave: every sample inline as WAV. The next save moves it to the new layout.
      for (const s of record.samples) {
        const buffer = await engine.decodeSample(s.audio)
        samples[s.id] = { ...buildSample(s.id, s.label, s.recordedAt, buffer, s.kind ?? 'recording'), ...(s.sequenceTrace ? { sequenceTrace: s.sequenceTrace } : {}) }
      }
      storedIds = new Set()
    }
    return stateFromMeta(record, samples)
  } finally {
    db.close()
  }
}

export async function clearAutosave(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  await saving
  const db = await openDb()
  try {
    const tx = db.transaction([META_STORE, SAMPLE_STORE], 'readwrite')
    tx.objectStore(META_STORE).delete(SNAPSHOT_KEY)
    tx.objectStore(SAMPLE_STORE).clear()
    await done(tx)
    storedIds = new Set()
  } finally {
    db.close()
  }
}
