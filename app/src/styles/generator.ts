import type { DrumVoiceKind } from '../engine/drumSynth'
import { WIND_INSTRUMENTS } from '../engine/phrasing'
import { chordName, diatonicChord, pitchClass, SCALES, type BankKind, type MusicalKey, type PadMusic } from '../music/theory'
import { createRng, mixSeed, pick, weighted } from './random'
import type { DrumRole, Pulse, StyleDef } from './types'

/** Where a generated layer lands: a bank's showing pads in grid order. */
export interface LayerTarget {
  kind: BankKind
  instrument?: string | undefined
  pads: Array<{ music: PadMusic | null; voice?: { name: string; kind: DrumVoiceKind } }>
}

/**
 * One layer to write. The beat owns the key, seed, length and chord
 * progression, so layers in different styles still fit; the layer owns its
 * style, its take (reroll count), its intensity (0 sparse … 0.5 as the
 * style is written … 1 busy) and its range (0 the keys or drums the style
 * itself uses … 1 all of the bank's keys or drums).
 */
export interface LayerContext {
  style: StyleDef
  key: MusicalKey
  seed: number
  take: number
  bars: number
  progression: number[]
  intensity: number
  /** 0 = the style's own keys / drums … 1 = spread across every pad of the bank. Missing = 0. */
  range?: number
}

/** Pad index → the steps it plays. */
export type LayerSteps = Record<number, number[]>

export const DEFAULT_INTENSITY = 0.5

export function styleStepCount(style: StyleDef): number {
  return style.bars * 16
}

/** A progression from the style, picked by the seed — the beat's shared chords. */
export function pickProgression(style: StyleDef, seed: number): number[] {
  return pick(createRng(mixSeed(seed, 'progression')), style.progressions)
}

/** A tempo inside the style's range, fixed by the seed. */
export function beatBpm(style: StyleDef, seed: number): number {
  const [low, high] = style.bpm
  return low + Math.floor(createRng(mixSeed(seed, 'bpm'))() * (high - low + 1))
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * Math.max(0, Math.min(1, t))
}

/**
 * The chance of a hit for one character of a line at an intensity. At 0.5 a
 * line plays exactly as written (x always, o 65%, - 25%, . never). Lower
 * thins it — `o`/`-` fade out, and below 0.25 even `x` hits off the beat
 * start dropping — while strong beats (every quarter note) always stay, so
 * the groove keeps its spine. Higher fills it in, and for `fillable` lines
 * (hats, percussion, bass, melody) empty 16ths start to sound too.
 */
export function hitChance(char: string, step: number, intensity: number, fillable: boolean): number {
  const low = intensity < 0.5
  const t = low ? intensity / 0.5 : (intensity - 0.5) / 0.5
  switch (char) {
    case 'x':
      return step % 4 === 0 || intensity >= 0.5 ? 1 : lerp(0.08, 1, intensity / 0.5)
    case 'o':
      return low ? lerp(0, 0.65, t) : lerp(0.65, 0.95, t)
    case '-':
      return low ? lerp(0, 0.25, t) : lerp(0.25, 0.7, t)
    default:
      return fillable && !low ? lerp(0, 0.18, t) : 0
  }
}

/**
 * Rolls one bar. Always draws one random number per 16th, whatever the
 * character, so every step keeps its own roll: moving the intensity only
 * ever adds or removes hits, never reshuffles the ones that stay.
 */
function rollBar(line: Pulse, rng: () => number, intensity: number, fillable: boolean): number[] {
  const steps: number[] = []
  for (let i = 0; i < 16; i++) {
    const roll = rng()
    if (roll < hitChance(line[i] ?? '.', i, intensity, fillable)) steps.push(i)
  }
  return steps
}

/**
 * Rolls a line into concrete steps over `bars`. A one-bar line is rolled
 * once and repeated, so the groove is consistent; the last bar is the fill
 * if there is one, else a fresh roll of the same line — a variation on the
 * turnaround. A multi-bar line is rolled bar by bar, cycling if the beat is
 * longer than the line.
 */
export function rollLine(line: Pulse, bars: number, rng: () => number, fill?: Pulse, intensity = DEFAULT_INTENSITY, fillable = false): number[] {
  const lineBars = Math.floor(line.length / 16)
  if (lineBars > 1) {
    const rolled = Array.from({ length: lineBars }, (_, bar) => rollBar(line.slice(bar * 16, bar * 16 + 16), rng, intensity, fillable))
    return Array.from({ length: bars }, (_, bar) => rolled[bar % lineBars]!.map((step) => step + bar * 16)).flat()
  }
  const main = rollBar(line, rng, intensity, fillable)
  const last = rollBar(fill ?? line, rng, intensity, fillable)
  return Array.from({ length: bars }, (_, bar) => (bar === bars - 1 && bars > 1 ? last : main).map((step) => step + bar * 16)).flat()
}

export function chordPcs(key: MusicalKey, degree: number): number[] {
  const index = ((degree % 7) + 7) % 7
  const intervals = SCALES[SCALES[key.scale].chordScale].intervals
  return diatonicChord(key, index, 60 + intervals[index]!).map((midi) => pitchClass(midi + key.tonic))
}

/** A progression's chord names in a key, e.g. ['Dm7', 'G7', 'Cmaj7'] — how the beat's chords are shown. */
export function progressionNames(key: MusicalKey, progression: number[]): string[] {
  const intervals = SCALES[SCALES[key.scale].chordScale].intervals
  return progression.map((degree) => {
    const index = ((degree % 7) + 7) % 7
    return chordName(diatonicChord(key, index, 60 + key.tonic + intervals[index]!), key)
  })
}

/** Which chord of the progression plays at a step. */
function chordIndexAt(progression: number[], step: number, stepCount: number): number {
  return Math.min(progression.length - 1, Math.floor((step * progression.length) / stepCount))
}

function chordAt(ctx: LayerContext, step: number): { degree: number; pcs: number[] } {
  const degree = ctx.progression[chordIndexAt(ctx.progression, step, ctx.bars * 16)]!
  return { degree, pcs: chordPcs(ctx.key, degree) }
}

/** A random stream unique to this beat, layer, take and purpose. */
function stream(ctx: LayerContext, kind: BankKind, ...purpose: Array<string | number>): () => number {
  return createRng(mixSeed(ctx.seed, kind, ctx.take, ...purpose))
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

/** Roles that may fill empty 16ths at high intensity — never the kick/snare spine. */
const FILLABLE_ROLES = new Set<DrumRole>(['hat', 'shaker', 'perc', 'ghost', 'ride'])

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

/** The role a kit voice plays when range brings it in beyond what the style uses. */
function roleForVoice(voice: { name: string; kind: DrumVoiceKind }): DrumRole {
  if (/open/i.test(voice.name) || voice.kind === 'tambourine') return 'openHat'
  if (/ghost/i.test(voice.name)) return 'ghost'
  switch (voice.kind) {
    case 'hihat': return 'hat'
    case 'china': return 'crash'
    case 'conga': case 'bongo': case 'cowbell': case 'claves': return 'perc'
    default: return voice.kind
  }
}

/**
 * Lines for drums the style leaves out, so a wider range adds parts that
 * still sit in a groove: pickups, ghost notes, off-beat percussion, a crash
 * on the one and tom runs into the next bar. Built for the whole pattern
 * (a line as long as the pattern spells every bar out).
 */
function extraLine(role: DrumRole, bars: number): Pulse {
  const bar = (line: string) => line.repeat(bars)
  const lastBarOnly = (line: string) => '.'.repeat((bars - 1) * 16) + line
  switch (role) {
    case 'kick': return bar('........-.....-.')
    case 'snare': return bar('.......-.......-')
    case 'ghost': return bar('..-..-....-..-..')
    case 'clap': return bar('....-.......-...')
    case 'rim': return bar('...-.....-...-..')
    case 'hat': case 'shaker': return bar('-.-.-.-.-.-.-.-.')
    case 'openHat': return bar('......-.......o.')
    case 'ride': return bar('o.-.o.-.o.-.o.-.')
    case 'crash': return 'x' + '.'.repeat(bars * 16 - 1)
    case 'tom': return lastBarOnly('..........-.o-oo')
    case 'perc': return bar('..-..-.-..-..-.-')
  }
}

function generateDrums(ctx: LayerContext, target: LayerTarget): LayerSteps {
  const { style } = ctx
  const steps: LayerSteps = {}
  const add = (pad: number, hits: number[]) => {
    // Two roles can land on one pad on a small kit — merge rather than overwrite.
    steps[pad] = [...new Set([...(steps[pad] ?? []), ...hits])].sort((a, b) => a - b)
  }
  const used = new Set<number>()
  for (const [role, lines] of Object.entries(style.drums.lines) as Array<[DrumRole, Pulse[]]>) {
    const pad = padForRole(role, target.pads)
    if (pad < 0 || lines.length === 0) continue
    used.add(pad)
    const line = pick(stream(ctx, 'drums', role, 'line'), lines)
    add(pad, rollLine(line, ctx.bars, stream(ctx, 'drums', role, 'roll'), style.drums.fills?.[role], ctx.intensity, FILLABLE_ROLES.has(role)))
  }
  // Range brings in the kit's other drums, in an order fixed by the beat, so
  // sliding up only ever adds drums and sliding back takes the same ones out.
  const range = Math.max(0, Math.min(1, ctx.range ?? 0))
  if (range > 0) {
    const order = stream(ctx, 'drums', 'range', 'order')
    const others = target.pads
      .flatMap((pad, index) => (pad.voice && !used.has(index) ? [{ index, voice: pad.voice, rank: order() }] : []))
      .sort((a, b) => a.rank - b.rank)
    for (const { index, voice } of others.slice(0, Math.round(range * others.length))) {
      const role = roleForVoice(voice)
      const hits = rollLine(extraLine(role, ctx.bars), ctx.bars, stream(ctx, 'drums', 'range', index), undefined, ctx.intensity, FILLABLE_ROLES.has(role))
      if (hits.length) add(index, hits)
    }
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

/** The lowest pad playing pitch class `pc` (above `above`, if given), or the pad nearest to where it would be. */
function lowestPadWithPc(pads: Array<{ index: number; midi: number }>, pc: number, above = -Infinity) {
  const matches = pads.filter((pad) => pitchClass(pad.midi) === pc && pad.midi > above)
  if (matches.length > 0) return matches[0]!
  const base = pads[0]!.midi
  const target = base + ((pc - pitchClass(base) + 12) % 12) + (above > -Infinity ? 12 : 0)
  return pads.reduce((best, pad) => (Math.abs(pad.midi - target) < Math.abs(best.midi - target) ? pad : best))
}

/**
 * Range for a pitched line: the same note an octave (or two) away, another
 * tone of the chord anywhere on the keys, or a passing note beside it — so
 * the line keeps its shape and harmony while reaching across all the keys.
 */
function spreadNote(pads: Array<{ index: number; midi: number }>, note: { index: number; midi: number }, pcs: number[], range: number, rng: () => number, played: Set<number>) {
  const roll = rng()
  if (roll >= range * 0.9) return note
  const at = pads.indexOf(note)
  // Keys not played yet come first, so the top of the range reaches all of them.
  const pick = (pool: typeof pads) => {
    const fresh = pool.filter((pad) => !played.has(pad.index))
    const from = fresh.length ? fresh : pool
    return from.length ? from[Math.floor(rng() * from.length)]! : note
  }
  if (roll < range * 0.4) return pick(pads.filter((pad) => pad !== note && pitchClass(pad.midi) === pitchClass(note.midi)))
  if (roll < range * 0.7) return pick(pads.filter((pad) => pad !== note && pcs.includes(pitchClass(pad.midi))))
  return pick([pads[at - 1], pads[at + 1]].filter((pad): pad is (typeof pads)[number] => !!pad))
}

function generateBass(ctx: LayerContext, target: LayerTarget): LayerSteps {
  const { style } = ctx
  const pads = notePads(target)
  if (pads.length === 0) return {}
  const stepCount = ctx.bars * 16
  const line = pick(stream(ctx, 'bass', 'line'), style.bass.rhythms)
  const hits = rollLine(line, ctx.bars, stream(ctx, 'bass', 'roll'), undefined, ctx.intensity, true)
  const hitSet = new Set(hits)
  const range = Math.max(0, Math.min(1, ctx.range ?? 0))
  const played = new Set<number>()
  const steps: LayerSteps = {}
  for (const step of hits) {
    // Each step decides its own note, so adding or removing other hits never changes it.
    const rng = stream(ctx, 'bass', 'note', step)
    const chord = chordAt(ctx, step)
    const root = lowestPadWithPc(pads, chord.pcs[0]!)
    let pad = root
    let next = step + 1
    while (next < stepCount && !hitSet.has(next)) next++
    const changesNext = next >= stepCount || chordIndexAt(ctx.progression, next % stepCount, stepCount) !== chordIndexAt(ctx.progression, step, stepCount)
    if (changesNext && step % 16 !== 0 && rng() < style.bass.approach) {
      // Walk in: the scale note just above or below the next chord's root.
      const nextRoot = lowestPadWithPc(pads, chordAt(ctx, next % stepCount).pcs[0]!)
      const at = pads.indexOf(nextRoot)
      pad = pads[Math.max(0, Math.min(pads.length - 1, at + (rng() < 0.5 ? -1 : 1)))]!
    } else if (step % 16 !== 0) {
      // Every bar's downbeat lands on the root; elsewhere the style's odds decide.
      const choice = weighted(rng, style.bass.notes)
      if (choice === 'fifth') pad = lowestPadWithPc(pads, chord.pcs[2] ?? chord.pcs[0]!, root.midi)
      if (choice === 'octave') pad = lowestPadWithPc(pads, chord.pcs[0]!, root.midi)
      if (range > 0) pad = spreadNote(pads, pad, chord.pcs, range, stream(ctx, 'bass', 'range', step), played)
    }
    played.add(pad.index)
    ;(steps[pad.index] ??= []).push(step)
  }
  return steps
}

function generateChords(ctx: LayerContext, target: LayerTarget): LayerSteps {
  const { style, key, progression } = ctx
  const stepCount = ctx.bars * 16
  const chordPads = target.pads.flatMap((pad, index) => (pad.music?.kind === 'chord' ? [{ index, midis: pad.music.midis }] : []))
  if (chordPads.length === 0) return {}
  // Each degree's pad: the same chord (every note), else the same root.
  const padFor = (degree: number) => {
    const pcs = chordPcs(key, degree)
    const same = (midis: number[]) => {
      const padPcs = new Set(midis.map(pitchClass))
      return pcs.length === padPcs.size && pcs.every((pc) => padPcs.has(pc))
    }
    return chordPads.find((pad) => pitchClass(pad.midis[0]!) === pcs[0] && same(pad.midis)) ?? chordPads.find((pad) => pitchClass(pad.midis[0]!) === pcs[0])
  }
  const line = pick(stream(ctx, 'chords', 'line'), style.chords.rhythms)
  const hits = rollLine(line, ctx.bars, stream(ctx, 'chords', 'roll'), undefined, ctx.intensity, false)
  // Every chord change always sounds, so the progression is heard at any intensity.
  const changes = progression.map((_, i) => Math.round((i * stepCount) / progression.length))
  const steps: LayerSteps = {}
  const range = Math.max(0, Math.min(1, ctx.range ?? 0))
  const changeSet = new Set(changes)
  // Range: a passing chord an eighth before a change leads into it, even in a sparse style.
  const passing = range > 0
    ? changes.filter((step) => step >= 2 && stream(ctx, 'chords', 'range', 'lead', step)() < range * 0.7).map((step) => step - 2)
    : []
  for (const step of [...new Set([...hits, ...changes, ...passing])].sort((a, b) => a - b)) {
    let pad = padFor(chordAt(ctx, step).degree)
    // Range: between the changes, other chords of the key pass through — first
    // the close relatives (two notes shared), then, near the top, any of them.
    const spread = stream(ctx, 'chords', 'range', step)
    if (pad && range > 0 && !changeSet.has(step) && spread() < range * 0.6) {
      const home = new Set(pad.midis.map(pitchClass))
      const others = chordPads.filter((item) => item.index !== pad!.index)
      const related = others.filter((item) => item.midis.filter((midi) => home.has(pitchClass(midi))).length >= 2)
      const pool = related.length && spread() > range * 0.5 ? related : others
      if (pool.length) pad = pool[Math.floor(spread() * pool.length)]!
    }
    if (pad) (steps[pad.index] ??= []).push(step)
  }
  return steps
}

function generateMelody(ctx: LayerContext, target: LayerTarget): LayerSteps {
  const { style } = ctx
  const pads = notePads(target)
  if (pads.length === 0) return {}
  const third = Math.max(1, Math.floor(pads.length / 3))
  const start = style.melody.register === 'low' ? 0 : style.melody.register === 'mid' ? third : third * 2
  const line = pick(stream(ctx, 'melody', 'line'), style.melody.rhythms)
  const hits = rollLine(line, ctx.bars, stream(ctx, 'melody', 'roll'), undefined, ctx.intensity, true)

  // One bar's contour (a motif) for all 16 positions, reused every bar so the
  // melody has a shape to remember; strong-beat notes snap to the chord.
  const rng = stream(ctx, 'melody', 'motif')
  const range = Math.max(0, Math.min(1, ctx.range ?? 0))
  const played = new Set<number>()
  const motif: number[] = []
  let at = start + Math.floor(rng() * third)
  for (let i = 0; i < 16; i++) {
    // Mostly steps (repeat, one or two scale notes), sometimes a leap.
    const size = rng() < style.melody.leap ? 3 + Math.floor(rng() * 2) : pick(rng, [0, 1, 1, 1, 2])
    at += rng() < 0.5 ? -size : size
    if (at < 0 || at >= pads.length) at = Math.max(0, Math.min(pads.length - 1, at + (at < 0 ? 2 * size : -2 * size)))
    motif.push(at)
  }
  const lastBar = ctx.bars - 1
  const steps: LayerSteps = {}
  for (const step of hits) {
    // Wind players need a breath every two bars (or at the end of a short
    // one-bar phrase). Keep the motif and harmony, leave its last eighth free.
    const phraseLength = Math.min(ctx.bars * 16, 32)
    if (target.instrument && WIND_INSTRUMENTS.has(target.instrument) && step % phraseLength >= phraseLength - 2) continue
    // The last bar answers the motif a step higher, so the loop turns around.
    let index = Math.max(0, Math.min(pads.length - 1, motif[step % 16]! + (Math.floor(step / 16) === lastBar && ctx.bars > 1 ? 1 : 0)))
    if (step % 4 === 0) {
      const pcs = chordAt(ctx, step).pcs
      search: for (let offset = 0; offset <= 3; offset++) {
        for (const candidate of [index - offset, index + offset]) {
          if (candidate >= 0 && candidate < pads.length && pcs.includes(pitchClass(pads[candidate]!.midi))) {
            index = candidate
            break search
          }
        }
      }
    }
    const note = range > 0 && step % 16 !== 0 ? spreadNote(pads, pads[index]!, chordAt(ctx, step).pcs, range, stream(ctx, 'melody', 'range', step), played) : pads[index]!
    played.add(note.index)
    ;(steps[note.index] ??= []).push(step)
  }
  return steps
}

/**
 * Writes one layer onto a bank's pads. Deterministic: the same context
 * always gives the same steps.
 */
export function generateLayer(ctx: LayerContext, target: LayerTarget): LayerSteps {
  switch (target.kind) {
    case 'drums':
      return generateDrums(ctx, target)
    case 'bass':
      return generateBass(ctx, target)
    case 'chords':
      return generateChords(ctx, target)
    case 'melody':
      return generateMelody(ctx, target)
  }
}
