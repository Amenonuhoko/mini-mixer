import type { DrumVoiceKind } from '../engine/drumSynth'
import { diatonicChord, pitchClass, SCALES, type BankKind, type MusicalKey, type PadMusic } from '../music/theory'
import { createRng, mixSeed, pick, weighted } from './random'
import type { DrumRole, Pulse, StyleDef } from './types'

/** Where a generated layer lands: a bank's showing pads in grid order. */
export interface LayerTarget {
  kind: BankKind
  pads: Array<{ music: PadMusic | null; voice?: { name: string; kind: DrumVoiceKind } }>
}

/** Which beat is being written: the style, the key, the beat's seed, and this layer's reroll count. */
export interface LayerContext {
  style: StyleDef
  key: MusicalKey
  seed: number
  take: number
}

/** Pad index → the steps it plays. */
export type LayerSteps = Record<number, number[]>

const CHANCE: Record<string, number> = { x: 1, o: 0.65, '-': 0.25 }

export function styleStepCount(style: StyleDef): number {
  return style.bars * 16
}

/** The beat's chord progression — shared by every layer of one beat, so bass and melody follow the chords. */
export function beatProgression(style: StyleDef, seed: number): number[] {
  return pick(createRng(mixSeed(seed, 'progression')), style.progressions)
}

/** A tempo inside the style's range, fixed by the beat's seed. */
export function beatBpm(style: StyleDef, seed: number): number {
  const [low, high] = style.bpm
  return low + Math.floor(createRng(mixSeed(seed, 'bpm'))() * (high - low + 1))
}

function rollBar(line: Pulse, rng: () => number): number[] {
  const steps: number[] = []
  for (let i = 0; i < 16; i++) if (rng() < (CHANCE[line[i] ?? '.'] ?? 0)) steps.push(i)
  return steps
}

/**
 * Rolls a line into concrete steps. A one-bar line is rolled once and
 * repeated, so the groove is consistent; the last bar is the fill if there
 * is one, else a fresh roll of the same line — a variation on the
 * turnaround. A line spelling out every bar is rolled as written.
 */
export function rollLine(line: Pulse, bars: number, rng: () => number, fill?: Pulse): number[] {
  if (line.length >= bars * 16) {
    return Array.from({ length: bars }, (_, bar) => rollBar(line.slice(bar * 16, bar * 16 + 16), rng).map((step) => step + bar * 16)).flat()
  }
  const main = rollBar(line, rng)
  const last = bars > 1 ? rollBar(fill ?? line, rng) : main
  return Array.from({ length: bars }, (_, bar) => (bar === bars - 1 ? last : main).map((step) => step + bar * 16)).flat()
}

/** The chord playing at a step: which degree, and its pitch classes (root first). */
function chordAt(progression: number[], step: number, stepCount: number, key: MusicalKey): { degree: number; pcs: number[] } {
  const degree = progression[Math.min(progression.length - 1, Math.floor((step * progression.length) / stepCount))]!
  return { degree, pcs: chordPcs(key, degree) }
}

export function chordPcs(key: MusicalKey, degree: number): number[] {
  const intervals = SCALES[SCALES[key.scale].chordScale].intervals
  const root = 60 + intervals[((degree % 7) + 7) % 7]!
  return diatonicChord(key, ((degree % 7) + 7) % 7, root).map((midi) => pitchClass(midi + key.tonic))
}

/** Every step where the chord changes, for walking a bassline into the next chord. */
function isLastBeforeChange(progression: number[], step: number, nextHit: number | undefined, stepCount: number): boolean {
  const chordIndex = (s: number) => Math.floor((s * progression.length) / stepCount)
  const next = nextHit ?? stepCount
  return chordIndex(next % stepCount) !== chordIndex(step) || next >= stepCount
}

// ---------------------------------------------------------------------------
// Drums
// ---------------------------------------------------------------------------

/** How each role finds its pad in whatever kit is loaded: exact voice names first, then any voice of these kinds. */
const ROLE_MATCH: Record<DrumRole, { names: string[]; kinds: DrumVoiceKind[] }> = {
  kick: { names: ['Kick', '808 Kick', 'Punch Kick'], kinds: ['kick'] },
  snare: { names: ['Snare Center', 'Electronic Snare', 'Snare Crack'], kinds: ['snare', 'clap', 'rim'] },
  ghost: { names: ['Snare Ghost'], kinds: ['rim'] },
  clap: { names: ['Hand Clap', 'Clap'], kinds: ['clap', 'snare'] },
  rim: { names: ['Side Stick', 'Claves'], kinds: ['rim', 'claves', 'cowbell'] },
  hat: { names: ['Closed Hat', 'Closed Hat Soft', 'Shaker'], kinds: ['hihat', 'shaker', 'tambourine'] },
  openHat: { names: ['Open Hat', 'Open Hat Light', 'Tambourine'], kinds: ['tambourine'] },
  ride: { names: ['Ride Bow', 'Ride'], kinds: ['ride'] },
  crash: { names: ['Crash', 'Crash Light'], kinds: ['crash', 'china'] },
  tom: { names: ['High Tom', 'Low Tom', 'Floor Tom'], kinds: ['tom', 'conga', 'bongo'] },
  perc: { names: ['High Conga', 'Cowbell', 'High Bongo'], kinds: ['conga', 'bongo', 'cowbell', 'claves'] },
  shaker: { names: ['Shaker', 'Closed Hat Soft', 'Closed Hat'], kinds: ['shaker', 'hihat', 'tambourine'] },
}

export function padForRole(role: DrumRole, pads: LayerTarget['pads']): number {
  const { names, kinds } = ROLE_MATCH[role]
  for (const name of names) {
    const index = pads.findIndex((pad) => pad.voice?.name === name)
    if (index >= 0) return index
  }
  for (const kind of kinds) {
    const index = pads.findIndex((pad) => pad.voice?.kind === kind)
    if (index >= 0) return index
  }
  return -1
}

function generateDrums(ctx: LayerContext, target: LayerTarget, rng: () => number): LayerSteps {
  const { style } = ctx
  const steps: LayerSteps = {}
  for (const [role, lines] of Object.entries(style.drums.lines) as Array<[DrumRole, Pulse[]]>) {
    const pad = padForRole(role, target.pads)
    if (pad < 0 || lines.length === 0) continue
    const rolled = rollLine(pick(rng, lines), style.bars, rng, style.drums.fills?.[role])
    // Two roles can land on one pad on a small kit — merge rather than overwrite.
    steps[pad] = [...new Set([...(steps[pad] ?? []), ...rolled])].sort((a, b) => a - b)
  }
  return steps
}

// ---------------------------------------------------------------------------
// Pitched layers
// ---------------------------------------------------------------------------

/** Note pads of a bank, lowest first, with their pad index. */
function notePads(target: LayerTarget): Array<{ index: number; midi: number }> {
  return target.pads
    .flatMap((pad, index) => (pad.music?.kind === 'note' ? [{ index, midi: pad.music.midis[0]! }] : []))
    .sort((a, b) => a.midi - b.midi)
}

/** The lowest pad playing pitch class `pc`, or the pad nearest to where it would be. */
function lowestPadWithPc(pads: Array<{ index: number; midi: number }>, pc: number, above = -Infinity) {
  const matches = pads.filter((pad) => pitchClass(pad.midi) === pc && pad.midi > above)
  if (matches.length > 0) return matches[0]!
  const base = pads[0]!.midi
  const target = base + ((pc - pitchClass(base) + 12) % 12) + (above > -Infinity ? 12 : 0)
  return pads.reduce((best, pad) => (Math.abs(pad.midi - target) < Math.abs(best.midi - target) ? pad : best))
}

function generateBass(ctx: LayerContext, target: LayerTarget, rng: () => number, progression: number[]): LayerSteps {
  const { style, key } = ctx
  const pads = notePads(target)
  if (pads.length === 0) return {}
  const stepCount = styleStepCount(style)
  const hits = rollLine(pick(rng, style.bass.rhythms), style.bars, rng)
  const steps: LayerSteps = {}
  hits.forEach((step, i) => {
    const chord = chordAt(progression, step, stepCount, key)
    const root = lowestPadWithPc(pads, chord.pcs[0]!)
    let pad = root
    if (isLastBeforeChange(progression, step, hits[i + 1], stepCount) && rng() < style.bass.approach) {
      // Walk in: the scale note just above or below the next chord's root.
      const nextStep = (hits[i + 1] ?? stepCount) % stepCount
      const nextRoot = lowestPadWithPc(pads, chordAt(progression, nextStep, stepCount, key).pcs[0]!)
      const at = pads.indexOf(nextRoot)
      pad = pads[Math.max(0, Math.min(pads.length - 1, at + (rng() < 0.5 ? -1 : 1)))]!
    } else if (step % 16 !== 0) {
      // The downbeat of each bar always lands on the root.
      const choice = weighted(rng, style.bass.notes)
      if (choice === 'fifth') pad = lowestPadWithPc(pads, chord.pcs[2] ?? chord.pcs[0]!, root.midi)
      if (choice === 'octave') pad = lowestPadWithPc(pads, chord.pcs[0]!, root.midi)
    }
    ;(steps[pad.index] ??= []).push(step)
  })
  return steps
}

function generateChords(ctx: LayerContext, target: LayerTarget, rng: () => number, progression: number[]): LayerSteps {
  const { style, key } = ctx
  const stepCount = styleStepCount(style)
  const chordPads = target.pads.flatMap((pad, index) => (pad.music?.kind === 'chord' ? [{ index, midis: pad.music.midis }] : []))
  if (chordPads.length === 0) return {}
  // Each degree's pad: the same chord (root and every note), else the same root, else nothing.
  const padFor = (degree: number) => {
    const pcs = chordPcs(key, degree)
    const same = (midis: number[]) => {
      const padPcs = new Set(midis.map(pitchClass))
      return pcs.length === padPcs.size && pcs.every((pc) => padPcs.has(pc))
    }
    return (
      chordPads.find((pad) => pitchClass(pad.midis[0]!) === pcs[0] && same(pad.midis)) ??
      chordPads.find((pad) => pitchClass(pad.midis[0]!) === pcs[0])
    )
  }
  const hits = rollLine(pick(rng, style.chords.rhythms), style.bars, rng)
  // Every chord change gets a hit even if the rhythm skipped it, so the progression is always heard.
  const changes = progression.map((_, i) => Math.round((i * stepCount) / progression.length))
  const all = [...new Set([...hits, ...changes])].sort((a, b) => a - b)
  const steps: LayerSteps = {}
  for (const step of all) {
    const pad = padFor(chordAt(progression, step, stepCount, key).degree)
    if (pad) (steps[pad.index] ??= []).push(step)
  }
  return steps
}

function generateMelody(ctx: LayerContext, target: LayerTarget, rng: () => number, progression: number[]): LayerSteps {
  const { style, key } = ctx
  const pads = notePads(target)
  if (pads.length === 0) return {}
  const stepCount = styleStepCount(style)
  const third = Math.max(1, Math.floor(pads.length / 3))
  const start = style.melody.register === 'low' ? 0 : style.melody.register === 'mid' ? third : third * 2
  const hits = rollLine(pick(rng, style.melody.rhythms), style.bars, rng)

  // One bar's contour (a motif), reused every bar so the melody has a shape
  // to remember; each note on a strong beat snaps to the chord playing then.
  const motif: number[] = []
  let at = start + Math.floor(rng() * third)
  for (let i = 0; i < 16; i++) {
    // Mostly steps (repeat, one or two scale notes), sometimes a leap.
    const size = rng() < style.melody.leap ? 3 + Math.floor(rng() * 2) : pick(rng, [0, 1, 1, 1, 2])
    at += rng() < 0.5 ? -size : size
    if (at < 0 || at >= pads.length) at = Math.max(0, Math.min(pads.length - 1, at + (at < 0 ? 2 * size : -2 * size)))
    motif.push(at)
  }
  const lastBar = style.bars - 1
  const steps: LayerSteps = {}
  for (const step of hits) {
    const bar = Math.floor(step / 16)
    // The last bar answers the motif a step higher, so the loop turns around.
    let index = Math.max(0, Math.min(pads.length - 1, motif[step % 16]! + (bar === lastBar && style.bars > 1 ? 1 : 0)))
    if (step % 4 === 0) {
      const pcs = chordAt(progression, step, stepCount, key).pcs
      let best = index
      for (let offset = 1; offset <= 3 && !pcs.includes(pitchClass(pads[best]!.midi)); offset++) {
        for (const candidate of [index - offset, index + offset]) {
          if (candidate >= 0 && candidate < pads.length && pcs.includes(pitchClass(pads[candidate]!.midi))) {
            best = candidate
            break
          }
        }
      }
      index = best
    }
    ;(steps[pads[index]!.index] ??= []).push(step)
  }
  return steps
}

/**
 * Writes one layer of a beat onto a bank's pads. Deterministic: the same
 * style, key, seed and take always give the same steps. Layers of one beat
 * share its progression (beatProgression), so they fit together.
 */
export function generateLayer(ctx: LayerContext, target: LayerTarget): LayerSteps {
  const rng = createRng(mixSeed(ctx.seed, target.kind, ctx.take))
  const progression = beatProgression(ctx.style, ctx.seed)
  switch (target.kind) {
    case 'drums':
      return generateDrums(ctx, target, rng)
    case 'bass':
      return generateBass(ctx, target, rng, progression)
    case 'chords':
      return generateChords(ctx, target, rng, progression)
    case 'melody':
      return generateMelody(ctx, target, rng, progression)
  }
}
