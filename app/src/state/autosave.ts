import type { AudioEngine } from '../engine/AudioEngine'
import {
  buildSample,
  buildTransport,
  encodeWav,
  extractProjectMeta,
  type ProjectMeta,
} from '../engine/projectFile'
import type { AppState, Sample } from './types'

const DB_NAME = 'mini-mixer'
const DB_VERSION = 1
const STORE_NAME = 'autosave'
const SNAPSHOT_KEY = 'session'

interface AutosaveSample {
  id: string
  label: string
  recordedAt: number
  audio: ArrayBuffer
}

/**
 * Same shape as ProjectMeta (see projectFile.ts) plus audio carried as raw
 * ArrayBuffers rather than base64 — IndexedDB stores binary natively, so
 * there's no reason to pay the ~33% base64 text-encoding cost autosave
 * pays on every debounced write, unlike the one-off downloadable file.
 * Extends ProjectMeta directly (rather than re-declaring its fields) so the
 * two representations can't quietly drift apart.
 */
interface AutosaveRecord extends ProjectMeta {
  savedAt: number
  samples: AutosaveSample[]
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error as Error)
  })
}

/** Best-effort: a missing/unavailable IndexedDB (e.g. some private-browsing modes) just means no autosave, not a crash. */
async function withDb<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  if (typeof indexedDB === 'undefined') return null
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode)
      const request = run(tx.objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error as Error)
    })
  } finally {
    db.close()
  }
}

export async function saveAutosave(state: AppState): Promise<void> {
  const record: AutosaveRecord = {
    savedAt: Date.now(),
    ...extractProjectMeta(state),
    samples: state.sampleOrder
      .map((id) => state.samples[id])
      .filter((sample): sample is Sample => sample != null)
      .map((sample) => ({
        id: sample.id,
        label: sample.label,
        recordedAt: sample.recordedAt,
        audio: encodeWav(sample.buffer),
      })),
  }
  await withDb('readwrite', (store) => store.put(record, SNAPSHOT_KEY))
}

export async function loadAutosave(engine: AudioEngine): Promise<AppState | null> {
  const record = await withDb<AutosaveRecord>('readonly', (store) => store.get(SNAPSHOT_KEY))
  if (!record) return null

  const samples: Record<string, Sample> = {}
  for (const s of record.samples) {
    const buffer = await engine.decodeSample(s.audio)
    samples[s.id] = buildSample(s.id, s.label, s.recordedAt, buffer)
  }
  return {
    samples,
    sampleOrder: record.sampleOrder,
    // An autosave written before instruments existed won't have these — default
    // them in rather than requiring a migration for old browser-stored records.
    instruments: record.instruments ?? {},
    instrumentOrder: record.instrumentOrder ?? [],
    pads: record.pads,
    visiblePadCount: record.visiblePadCount,
    patterns: record.patterns,
    activePatternId: record.activePatternId,
    transport: buildTransport(record.transport),
  }
}

export async function clearAutosave(): Promise<void> {
  await withDb('readwrite', (store) => store.delete(SNAPSHOT_KEY))
}
