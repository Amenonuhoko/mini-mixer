import { generateLayer } from './generator'
import { styleById } from './library'
import { createRng, mixSeed } from './random'
import type { AppState, BankKind, Pattern } from '../state/types'
import { DRUM_KITS } from '../engine/drumSynth'

export type VariationKind = 'sparser' | 'busier' | 'syncopated' | 'fill' | 'crash' | 'pause' | 'bass-drop' | 'new-take'
export const VARIATIONS: { id: VariationKind; label: string }[] = [
  { id: 'sparser', label: 'Sparser' }, { id: 'busier', label: 'Busier' },
  { id: 'syncopated', label: 'More syncopated' }, { id: 'new-take', label: 'New take' },
  { id: 'fill', label: 'Add a fill' }, { id: 'crash', label: 'Opening crash' },
  { id: 'pause', label: 'Short pause' }, { id: 'bass-drop', label: 'Bass dropout' },
]

/** Reuses exact sample IDs within each beat, preserving harmony and recorded sounds. */
export function varyPattern(state: AppState, source: Pattern, kind: VariationKind, locked: BankKind[], seed = 0): Pattern {
  const steps = Object.fromEntries(Object.entries(source.steps).map(([id, row]) => [id, [...row]]))
  const end = source.stepCount
  for (const bank of state.banks) {
    if (locked.includes(bank.kind)) continue
    const kitId = bank.sound?.type === 'kit' ? bank.sound.kitId : null
    const kit = DRUM_KITS.find((item) => item.id === kitId)
    const layer = source.groove?.layers[bank.kind]
    const style = layer && styleById(layer.styleId)
    if (kind === 'new-take' && layer && style && source.groove) {
      const pads = bank.padIds.slice(0, bank.visibleCount).map((id) => state.pads.find((pad) => pad.id === id))
      const generated = generateLayer({ style, key: state.key, seed: source.groove.seed, take: layer.take + seed + 1,
        bars: source.groove.bars, progression: source.groove.progression, intensity: layer.intensity }, {
        kind: bank.kind, pads: pads.map((pad, i) => ({ music: pad?.music ?? null, ...(kit?.voices[i] ? { voice: kit.voices[i]! } : {}) })) })
      for (const id of bank.padIds) steps[id] = new Array<string | null>(end).fill(null)
      for (const [index, hits] of Object.entries(generated)) {
        const pad = pads[Number(index)]
        if (!pad) continue
        const sample = source.steps[pad.id]?.find(Boolean) ?? pad.sampleId
        if (!sample) continue
        const length = source.groove.bars * 16
        for (let offset = 0; offset < end; offset += length) for (const hit of hits) if (hit + offset < end) steps[pad.id]![hit + offset] = sample
      }
      continue
    }
    for (const [rowIndex, padId] of bank.padIds.entries()) {
      const original = source.steps[padId] ?? new Array<string | null>(end).fill(null)
      const row = steps[padId] ??= [...original]
      if (kind === 'pause' || kind === 'bass-drop') {
        if (kind === 'pause' || bank.kind === 'bass') for (let i = Math.max(0, end - 4); i < end; i++) row[i] = null
        continue
      }
      if (kind === 'sparser') {
        const hits = original.flatMap((sample, i) => sample ? [i] : [])
        // Keep the first hit in each row and a steady downbeat backbone.
        for (const [n, i] of hits.entries()) if (n > 0 && (i % 4 !== 0 || n % 2 === 1)) row[i] = null
      }
      if (kind === 'busier') {
        // Sustain chords; add at most one extra note per beat to other parts.
        if (bank.kind === 'chords') continue
        for (let beat = 0; beat < end; beat += 4) {
          const sample = original.slice(beat, beat + 4).find(Boolean)
          if (!sample) continue
          const offset = (seed + rowIndex) % 2 ? 3 : 2
          const at = Math.min(end - 1, beat + offset)
          if (!row[at]) row[at] = sample
        }
      }
      if (kind === 'new-take' && bank.kind !== 'chords') {
        const rng = createRng(mixSeed(seed, padId))
        for (let beat = 4; beat < end; beat += 4) {
          const notes = original.slice(beat, beat + 4).filter((sample): sample is string => !!sample)
          const slots = [0, 1, 2, 3].map((offset) => ({ offset, rank: rng() })).sort((a, b) => a.rank - b.rank)
          for (let i = beat; i < Math.min(end, beat + 4); i++) row[i] = null
          notes.forEach((sample, i) => { const at = beat + slots[i]!.offset; if (at < end) row[at] = sample })
        }
      }
      if (kind === 'syncopated' && bank.kind !== 'chords') {
        for (let beat = 0; beat < end; beat += 4) {
          if (beat === 0) continue
          const at = beat + 2
          if (at < end && original[beat] && !original[at]) { row[at] = original[beat]!; row[beat] = null }
        }
      }
    }
    if (bank.kind !== 'drums' || (kind !== 'fill' && kind !== 'crash')) continue
    const candidates = bank.padIds.flatMap((id, index) => {
      const voice = kit?.voices[index]
      const pad = state.pads.find((item) => item.id === id)
      const sample = source.steps[id]?.find(Boolean) ?? pad?.sampleId
      const suitable = kind === 'crash' ? voice?.kind === 'crash' : voice && ['snare', 'tom', 'clap', 'conga', 'bongo'].includes(voice.kind)
      return suitable && sample && state.samples[sample] ? [{ id, sample }] : []
    })
    if (kind === 'crash') {
      const hit = candidates[0]
      if (hit) (steps[hit.id] ??= new Array<string | null>(end).fill(null))[0] = hit.sample
    } else if (candidates.length) {
      for (let i = Math.max(0, end - 4); i < end; i++) {
        const hit = candidates[(i + seed) % candidates.length]!
        ;(steps[hit.id] ??= new Array<string | null>(end).fill(null))[i] = hit.sample
      }
    }
  }
  return { ...source, steps }
}

export function sectionEnergy(name: string): VariationKind {
  return /chorus|drop|build|final/i.test(name) && !/breakdown/i.test(name) ? 'busier' : 'sparser'
}

/** Section roles share harmony but develop different rhythmic identities. */
export function developSection(state: AppState, source: Pattern, name: string, locked: BankKind[], seed: number): Pattern {
  const role = name.toLowerCase()
  if (/chorus|drop|final/.test(role) && !/breakdown/.test(role)) return varyPattern(state, varyPattern(state, source, 'new-take', locked, seed), 'busier', locked, seed)
  if (/bridge/.test(role)) return varyPattern(state, source, 'syncopated', locked, seed)
  const sparse = varyPattern(state, varyPattern(state, source, 'new-take', locked, seed), 'sparser', locked, seed)
  if (/build/.test(role)) {
    const busy = varyPattern(state, source, 'busier', locked, seed)
    return { ...source, steps: Object.fromEntries(Object.keys(source.steps).map((id) => [id,
      Array.from({ length: source.stepCount }, (_, i) => (i < source.stepCount / 2 ? sparse.steps[id]?.[i] : busy.steps[id]?.[i]) ?? null)])) }
  }
  if (/intro|outro|breakdown/.test(role)) return varyPattern(state, sparse, 'sparser', locked, seed)
  return sparse
}
