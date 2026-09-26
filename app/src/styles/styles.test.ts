import { describe, expect, it } from 'vitest'
import { DRUM_KITS } from '../engine/drumSynth'
import { INSTRUMENT_PRESETS } from '../engine/synth'
import { bankLayout, MOODS, pitchClass, type MusicalKey } from '../music/theory'
import { normalizeGroove } from '../engine/projectFile'
import { chordPcs, DEFAULT_INTENSITY, generateLayer, hitChance, padForRole, pickProgression, rollLine, styleStepCount, type LayerContext, type LayerTarget } from './generator'
import { STYLES } from './library'
import { createRng } from './random'

const C_MAJOR: MusicalKey = { tonic: 0, scale: 'major', chordColor: 'triad' }

it('leaves deterministic breathing gaps in generated wind melodies while preserving other notes', () => {
  const context = ctxFor(STYLES[0]!, { bars: 4, intensity: 1 })
  const target = melodicTarget('melody')
  const ordinary = generateLayer(context, target)
  const wind = generateLayer(context, { ...target, instrument: 'Flute' })
  expect(Object.values(wind).flat().length).toBeGreaterThan(0)
  for (const [pad, hits] of Object.entries(wind)) {
    expect(hits.every((step) => step % 32 < 30)).toBe(true)
    expect(hits.every((step) => ordinary[Number(pad)]?.includes(step))).toBe(true)
  }
  expect(wind).toEqual(generateLayer(context, { ...target, instrument: 'Flute' }))
})

/** A layer of a beat in `style` (its own length and progression) unless overridden. */
function ctxFor(style: (typeof STYLES)[number], overrides: Partial<LayerContext> = {}): LayerContext {
  const seed = overrides.seed ?? 42
  return { style, key: C_MAJOR, seed, take: 0, bars: style.bars, progression: pickProgression(style, seed), intensity: DEFAULT_INTENSITY, ...overrides }
}

function kitTarget(kitId: string): LayerTarget {
  const kit = DRUM_KITS.find((item) => item.id === kitId)!
  return { kind: 'drums', pads: kit.voices.map((voice) => ({ music: null, voice: { name: voice.name, kind: voice.kind } })) }
}

function melodicTarget(kind: 'bass' | 'chords' | 'melody', key = C_MAJOR): LayerTarget {
  return { kind, pads: bankLayout(kind, key, 'guided').pads.map((music) => ({ music })) }
}

describe('style library', () => {
  it('is well-formed: valid lines, degrees, sounds and moods', () => {
    const presetNames = new Set(INSTRUMENT_PRESETS.map((preset) => preset.name))
    const moodIds = new Set(MOODS.map((mood) => mood.id))
    const ids = new Set<string>()
    for (const style of STYLES) {
      expect(ids.has(style.id), style.id).toBe(false)
      ids.add(style.id)
      const lines = [
        ...Object.values(style.drums.lines).flat(),
        ...Object.values(style.drums.fills ?? {}),
        ...style.bass.rhythms,
        ...style.chords.rhythms,
        ...style.melody.rhythms,
      ]
      for (const line of lines) {
        expect([16, styleStepCount(style)], `${style.id}: "${line}"`).toContain(line.length)
        expect(line, style.id).toMatch(/^[xo.-]+$/)
      }
      for (const progression of style.progressions) for (const degree of progression) expect(degree).toBeLessThan(7)
      expect(DRUM_KITS.some((kit) => kit.id === style.sounds.drums)).toBe(true)
      for (const name of [style.sounds.bass, style.sounds.chords, style.sounds.melody]) expect(presetNames.has(name), name).toBe(true)
      for (const mood of style.moods) expect(moodIds.has(mood)).toBe(true)
      expect(style.bpm[0]).toBeLessThanOrEqual(style.bpm[1])
    }
  })
})

describe('rollLine', () => {
  it('repeats the rolled bar and varies only the last', () => {
    const steps = rollLine('x...x...x...x...', 4, createRng(1), 'x.x.x.x.x.x.x.x.')
    expect(steps.filter((step) => step < 48)).toEqual([0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44])
    expect(steps.filter((step) => step >= 48)).toHaveLength(8)
  })
})

describe('generateLayer', () => {
  const style = STYLES.find((item) => item.id === 'boom-bap')!

  it('is deterministic for a seed and changes with the take', () => {
    const ctx = ctxFor(style)
    const target = kitTarget('acoustic-drums')
    expect(generateLayer(ctx, target)).toEqual(generateLayer(ctx, target))
    const takes = new Set(Array.from({ length: 6 }, (_, take) => JSON.stringify(generateLayer({ ...ctx, take }, target))))
    expect(takes.size).toBeGreaterThan(1)
  })

  it('finds each drum role on any kit, skipping roles the kit lacks', () => {
    expect(padForRole('kick', kitTarget('acoustic-drums').pads)).toBeGreaterThanOrEqual(0)
    expect(padForRole('clap', kitTarget('electronic-drums').pads)).toBeGreaterThanOrEqual(0)
    expect(padForRole('kick', kitTarget('hand-percussion').pads)).toBe(-1)
  })

  it('puts the backbeat snare on 2 and 4', () => {
    const target = kitTarget('acoustic-drums')
    const steps = generateLayer(ctxFor(style, { seed: 7 }), target)
    const snare = steps[padForRole('snare', target.pads)]!
    expect(snare).toEqual(expect.arrayContaining([4, 12, 20, 28]))
  })

  for (const each of STYLES) {
    it(`${each.name}: every layer stays in range and the bass roots each bar on the chord`, () => {
      const seed = 1234
      const stepCount = styleStepCount(each)
      const progression = pickProgression(each, seed)
      for (const kind of ['bass', 'chords', 'melody'] as const) {
        const target = melodicTarget(kind)
        const steps = generateLayer(ctxFor(each, { seed }), target)
        for (const [pad, list] of Object.entries(steps)) {
          expect(Number(pad)).toBeLessThan(target.pads.length)
          for (const step of list) expect(step).toBeLessThan(stepCount)
        }
        if (kind === 'bass') {
          const downbeats = Object.entries(steps).flatMap(([pad, list]) => list.filter((step) => step % 16 === 0).map((step) => ({ pad: Number(pad), step })))
          for (const { pad, step } of downbeats) {
            const degree = progression[Math.floor((step * progression.length) / stepCount)]!
            expect(pitchClass(target.pads[pad]!.music!.midis[0]!)).toBe(chordPcs(C_MAJOR, degree)[0])
          }
        }
        if (kind === 'chords') {
          // Every chord of the progression is heard.
          const heard = new Set(Object.keys(steps).map((pad) => pitchClass(target.pads[Number(pad)]!.music!.midis[0]!)))
          for (const degree of progression) expect(heard.has(chordPcs(C_MAJOR, degree)[0]!)).toBe(true)
        }
      }
    })
  }

  it('fits a pentatonic melody bank too', () => {
    const key: MusicalKey = { tonic: 9, scale: 'minorPentatonic', chordColor: 'triad' }
    const target = melodicTarget('melody', key)
    const steps = generateLayer(ctxFor(style, { key, seed: 3 }), target)
    expect(Object.keys(steps).length).toBeGreaterThan(0)
  })
})

describe('intensity', () => {
  it('plays a line as written at the middle, thins toward 0 and fills toward 1, keeping strong beats', () => {
    expect(hitChance('o', 2, DEFAULT_INTENSITY, false)).toBeCloseTo(0.65)
    expect(hitChance('-', 2, 0, false)).toBe(0)
    expect(hitChance('x', 0, 0, false)).toBe(1)
    expect(hitChance('x', 2, 0, false)).toBeLessThan(1)
    expect(hitChance('.', 3, 1, true)).toBeGreaterThan(0)
    expect(hitChance('.', 3, 1, false)).toBe(0)
  })

  it('only adds hits as it rises (every step keeps its own roll)', () => {
    for (const style of STYLES) {
      const target = kitTarget(style.sounds.drums)
      let previous: Record<number, number[]> | null = null
      for (const intensity of [0, 0.25, 0.5, 0.75, 1]) {
        const steps = generateLayer(ctxFor(style, { intensity }), target)
        if (previous) {
          for (const [pad, list] of Object.entries(previous)) {
            for (const step of list) expect(steps[Number(pad)], `${style.id} @${intensity}`).toContain(step)
          }
        }
        previous = steps
      }
    }
  })

  it('makes a layer measurably busier at 1 than at 0', () => {
    const style = STYLES.find((item) => item.id === 'funk')!
    const count = (intensity: number) => Object.values(generateLayer(ctxFor(style, { intensity }), melodicTarget('bass'))).flat().length
    expect(count(1)).toBeGreaterThan(count(0))
  })
})

describe('mixing styles', () => {
  it('a layer in one style follows the beat progression and length from another', () => {
    const lofi = STYLES.find((item) => item.id === 'lofi')!
    const funk = STYLES.find((item) => item.id === 'funk')!
    const progression = pickProgression(lofi, 99)
    const target = melodicTarget('bass')
    const steps = generateLayer(ctxFor(funk, { seed: 99, bars: lofi.bars, progression }), target)
    const stepCount = lofi.bars * 16
    const all = Object.values(steps).flat()
    expect(Math.max(...all)).toBeGreaterThanOrEqual(48) // spans lo-fi's four bars, not funk's two
    for (const [pad, list] of Object.entries(steps)) {
      for (const step of list.filter((each) => each % 16 === 0)) {
        const degree = progression[Math.floor((step * progression.length) / stepCount)]!
        expect(pitchClass(target.pads[Number(pad)]!.music!.midis[0]!)).toBe(chordPcs(C_MAJOR, degree)[0])
      }
    }
  })

  it('migrates a Phase 2 one-style beat to per-layer styles with the same progression', () => {
    const lofi = STYLES.find((item) => item.id === 'lofi')!
    const groove = normalizeGroove({ styleId: 'lofi', seed: 5, takes: { bass: 2 } })!
    expect(groove.bars).toBe(lofi.bars)
    expect(groove.progression).toEqual(pickProgression(lofi, 5))
    expect(groove.layers.bass).toEqual({ styleId: 'lofi', take: 2, intensity: DEFAULT_INTENSITY })
    expect(groove.layers.drums?.take).toBe(0)
    expect(normalizeGroove(null)).toBeNull()
    expect(normalizeGroove(groove)).toBe(groove)
  })
})


it('offers substantially sparser simple beats and repeatable variations across the library', () => {
  for (const style of STYLES) {
    const target = kitTarget(style.sounds.drums)
    const count = (intensity: number) => Array.from({ length: 8 }, (_, seed) => Object.values(generateLayer(ctxFor(style, { seed, intensity }), target)).flat().length).reduce((a, b) => a + b, 0)
    expect(count(.1), style.name).toBeLessThan(count(.9))
    const takes = new Set(Array.from({ length: 12 }, (_, take) => JSON.stringify(generateLayer(ctxFor(style, { take, intensity: .9 }), target))))
    expect(takes.size, style.name).toBeGreaterThan(2)
  }
})

describe('range: the style\'s keys … all the keys', () => {
  const pads = (steps: Record<number, number[]>) => Object.keys(steps).filter((pad) => steps[Number(pad)]!.length > 0).length
  const average = (fn: (seed: number) => number) => Array.from({ length: 12 }, (_, seed) => fn(seed)).reduce((sum, n) => sum + n, 0) / 12

  it('changes nothing at 0, so existing beats stay as they are', () => {
    for (const style of STYLES) {
      for (const target of [kitTarget('acoustic-drums'), melodicTarget('bass'), melodicTarget('chords'), melodicTarget('melody')]) {
        const ctx = ctxFor(style, { seed: 9 })
        expect(generateLayer({ ...ctx, range: 0 }, target)).toEqual(generateLayer(ctx, target))
      }
    }
  })

  it('brings in the rest of the kit as it rises, and only ever adds drums', () => {
    const style = STYLES.find((item) => item.id === 'boom-bap')!
    const target = kitTarget('acoustic-drums')
    const voiced = target.pads.length
    const used = [0, 0.25, 0.5, 0.75, 1].map((range) => Object.keys(generateLayer(ctxFor(style, { seed: 5, range, intensity: 0.7 }), target)).map(Number))
    for (let i = 1; i < used.length; i++) expect(used[i]!).toEqual(expect.arrayContaining(used[i - 1]!))
    expect(used[4]!.length).toBeGreaterThan(used[0]!.length + 4)
    expect(used[4]!.length).toBeGreaterThanOrEqual(Math.floor(voiced * 0.8))
  })

  for (const kind of ['bass', 'chords', 'melody'] as const) {
    it(`spreads ${kind} across more keys at 1 than at 0`, () => {
      const style = STYLES.find((item) => item.id === 'house')!
      const target = melodicTarget(kind)
      const at = (range: number) => average((seed) => pads(generateLayer(ctxFor(style, { seed, range, intensity: 0.7 }), target)))
      expect(at(1)).toBeGreaterThan(at(0) * 1.3)
    })
  }

  it('keeps the bass on the root every downbeat and every chord change heard, at any range', () => {
    const style = STYLES.find((item) => item.id === 'funk')!
    const seed = 21
    const progression = pickProgression(style, seed)
    const stepCount = styleStepCount(style)
    const bass = melodicTarget('bass')
    const steps = generateLayer(ctxFor(style, { seed, range: 1 }), bass)
    for (const [pad, list] of Object.entries(steps)) for (const step of list.filter((item) => item % 16 === 0)) {
      const degree = progression[Math.floor((step * progression.length) / stepCount)]!
      expect(pitchClass(bass.pads[Number(pad)]!.music!.midis[0]!)).toBe(chordPcs(C_MAJOR, degree)[0])
    }
    const chords = melodicTarget('chords')
    const heard = new Set(Object.keys(generateLayer(ctxFor(style, { seed, range: 1 }), chords)).map((pad) => pitchClass(chords.pads[Number(pad)]!.music!.midis[0]!)))
    for (const degree of progression) expect(heard.has(chordPcs(C_MAJOR, degree)[0]!)).toBe(true)
  })
})
