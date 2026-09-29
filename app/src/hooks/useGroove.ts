import { useState, useSyncExternalStore } from 'react'
import { useEngine } from '../state/EngineContext'
import { buildBank } from '../engine/bankBuilder'
import { DRUM_KITS } from '../engine/drumSynth'
import { moodById } from '../music/theory'
import { useAppState } from '../state/AppStateContext'
import { BANK_KINDS, getBank, visibleBankPads } from '../state/banks'
import type { Action } from '../state/reducer'
import type { AppState, Bank, BankKind, BankSound, Groove, GrooveLayer, PadMusic } from '../state/types'
import { beatBpm, DEFAULT_INTENSITY, generateLayer, pickProgression, type LayerSteps, type LayerTarget } from '../styles/generator'
import { STYLES, styleById } from '../styles/library'
import { newSeed } from '../styles/random'
import type { StyleDef } from '../styles/types'

function styleSound(style: StyleDef, kind: BankKind): BankSound {
  return kind === 'drums' ? { type: 'kit', kitId: style.sounds.drums } : { type: 'preset', name: style.sounds[kind] }
}

/** What the generator writes onto: a bank's showing pads, with each drum pad's kit voice. */
function layerTarget(bank: Bank, sound: BankSound | null, pads: Array<{ music: PadMusic | null }>): LayerTarget {
  const kit = sound?.type === 'kit' ? DRUM_KITS.find((item) => item.id === sound.kitId) : undefined
  return {
    kind: bank.kind,
    instrument: sound?.type === 'preset' ? sound.name : undefined,
    pads: pads.map((pad, index) => {
      const voice = kit?.voices[index]
      return voice ? { music: pad.music, voice: { name: voice.name, kind: voice.kind } } : { music: pad.music }
    }),
  }
}

/** Repeats a layer across a pattern longer than the beat. */
function tile(steps: LayerSteps, layerLength: number, patternLength: number): LayerSteps {
  const repeats = Math.max(1, Math.floor(patternLength / layerLength))
  return Object.fromEntries(
    Object.entries(steps).map(([pad, list]) => [pad, Array.from({ length: repeats }, (_, r) => list.map((step) => step + r * layerLength)).flat()]),
  )
}

export function bankHasSteps(state: AppState, bank: Bank): boolean {
  const pattern = state.patterns.find((item) => item.id === state.activePatternId)
  return !!pattern && bank.padIds.some((padId) => (pattern.steps[padId] ?? []).some((cell) => cell !== null))
}

/** The style a beat's chords come from: the chords layer's, else any layer's, else the first in the library. */
export function beatStyle(groove: Groove): StyleDef {
  const styleId = groove.layers.chords?.styleId ?? Object.values(groove.layers)[0]?.styleId
  return (styleId && styleById(styleId)) || STYLES[0]!
}

/** A fresh beat in a style: a new seed, the style's length and one of its progressions, no layers yet. */
export function newGroove(style: StyleDef, seed = newSeed()): Groove {
  return { seed, bars: style.bars, progression: pickProgression(style, seed), layers: {} }
}

/**
 * Writes one bank's preset layer into the active pattern (tiled across it if
 * the pattern is longer than the beat), from the given pads — the bank's
 * current pads unless a fresh build is passed in.
 */
function writeLayer(
  state: AppState,
  dispatch: React.Dispatch<Action>,
  groove: Groove,
  bank: Bank,
  layer: GrooveLayer,
  sound: BankSound | null,
  pads: Array<{ music: PadMusic | null }>,
): void {
  const pattern = state.patterns.find((item) => item.id === state.activePatternId)
  const style = styleById(layer.styleId)
  if (!pattern || !style) return
  const length = groove.bars * 16
  const steps = generateLayer(
    { style, key: state.key, seed: groove.seed, take: layer.take, bars: groove.bars, progression: groove.progression, intensity: layer.intensity, range: layer.range ?? 0 },
    layerTarget(bank, sound, pads),
  )
  dispatch({
    type: 'WRITE_BANK_PATTERN',
    bankId: bank.id,
    patternId: pattern.id,
    stepsByPadIndex: tile(steps, length, Math.max(pattern.stepCount, length)),
    minStepCount: length,
  })
}

// One job at a time across every place presets are used (the Styles dock and each bank's strip).
let busyJob: string | null = null
const busyListeners = new Set<() => void>()
function setBusyJob(job: string | null) {
  busyJob = job
  for (const listener of busyListeners) listener()
}
function subscribeBusy(listener: () => void) {
  busyListeners.add(listener)
  return () => busyListeners.delete(listener)
}

/**
 * Presets as a working tool, not just a starting point. A beat's preset
 * layers share one seed, length and chord progression (AppState.groove);
 * each bank's layer can come from any style, at any intensity, in any take:
 *
 * - startBeat: a whole beat in one style — its tempo, a mood that suits it
 *   (the current one if the style fits), every bank's sound, all four layers.
 * - setLayerStyle: puts a style's layer into one bank (the same style again
 *   rolls a new take). A bank without a suitable sound gets the style's; a
 *   sound already there is kept.
 * - newTake / setIntensity / clearLayer: reroll, thin out or fill in, remove.
 * - newChords / setChords: a new or a chosen progression — every preset layer
 *   is rewritten to follow.
 * - setLength: 1, 2 or 4 bars — every layer is rewritten over the new length.
 * - setIntensityFor / setRangeFor / clearLayers: the same as the one-part
 *   versions, for several parts in one update.
 */
export function useGroove() {
  const { state, dispatch } = useAppState()
  const engine = useEngine()
  const busy = useSyncExternalStore(subscribeBusy, () => busyJob)
  const [error, setError] = useState<string | null>(null)

  const run = async (label: string, work: () => Promise<void> | void) => {
    if (busyJob) return
    setBusyJob(label)
    setError(null)
    try {
      await work()
      return true
    } catch (caught) {
      console.error(caught)
      setError(caught instanceof Error ? caught.message : 'Could not build that')
      return false
    } finally {
      setBusyJob(null)
    }
  }

  const startBeat = (style: StyleDef, options: { intensity?: number; bars?: 1 | 2 | 4; kinds?: BankKind[]; keepSounds?: boolean } = {}) =>
    run(`start:${style.id}`, async () => {
      const pattern = state.patterns.find((item) => item.id === state.activePatternId)
      if (!pattern) return
      engine.setSequencerPlaybackEnabled(false)
      engine.stopAllSounds()
      dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: false })
      const groove = { ...newGroove(style), bars: options.bars ?? style.bars }
      const keepMood = options.keepSounds || state.mood !== null && style.moods.includes(state.mood)
      const mood = keepMood ? state.mood! : style.moods[0]!
      const key = keepMood ? state.key : moodById(mood).key
      const kinds = options.kinds ?? BANK_KINDS
      // Only the parts being generated get sounds built — a drums-only beat leaves the other banks alone.
      const builds = await Promise.all(
        state.banks
          .filter((bank) => kinds.includes(bank.kind) && (!options.keepSounds || !bank.sound))
          .map((bank) => buildBank(bank, styleSound(style, bank.kind), { key, padLayout: state.padLayout, samples: state.samples })),
      )
      if (builds.length) dispatch({ type: 'APPLY_BANK_BUILDS', builds, remap: 'index', key, mood })
      dispatch({ type: 'SET_BPM', bpm: beatBpm(style, groove.seed) })
      dispatch({ type: 'START_PATTERN', patternId: pattern.id, stepCount: groove.bars * 16 })
      // A new beat keeps each part's range; everything else starts over.
      const layerFor = (kind: BankKind): GrooveLayer => {
        const range = state.groove?.layers[kind]?.range
        return { styleId: style.id, take: 0, intensity: options.intensity ?? DEFAULT_INTENSITY, ...(range ? { range } : {}) }
      }
      const fresh = { ...state, key, patterns: state.patterns.map((item) => (item.id === pattern.id ? { ...item, stepCount: groove.bars * 16 } : item)) }
      for (const bank of state.banks) {
        const build = builds.find((item) => item.bankId === bank.id)
        if (kinds.includes(bank.kind)) writeLayer(fresh, dispatch, groove, bank, layerFor(bank.kind), build?.sound ?? bank.sound, build?.pads ?? visibleBankPads(state, bank))
      }
      dispatch({ type: 'SET_GROOVE', groove: { ...groove, layers: Object.fromEntries(kinds.map((kind) => [kind, layerFor(kind)])) } })
    })

  const setLayerStyle = (kind: BankKind, style: StyleDef) =>
    run(`${kind}:${style.id}`, async () => {
      const groove = state.groove ?? newGroove(style)
      const current = groove.layers[kind]
      const layer: GrooveLayer = {
        styleId: style.id,
        take: current?.styleId === style.id ? current.take + 1 : 0,
        intensity: current?.intensity ?? DEFAULT_INTENSITY,
        ...(current?.range ? { range: current.range } : {}),
      }
      const bank = getBank(state, kind)
      let sound = bank.sound
      let pads: Array<{ music: PadMusic | null }> = visibleBankPads(state, bank)
      const needsSound = kind === 'drums' ? sound?.type !== 'kit' : sound === null
      if (needsSound) {
        sound = styleSound(style, kind)
        const build = await buildBank(bank, sound, { key: state.key, padLayout: state.padLayout, samples: state.samples })
        dispatch({ type: 'APPLY_BANK_BUILDS', builds: [build], remap: 'index' })
        pads = build.pads
      }
      writeLayer(state, dispatch, groove, bank, layer, sound, pads)
      dispatch({ type: 'SET_GROOVE', groove: { ...groove, layers: { ...groove.layers, [kind]: layer } } })
    })

  /**
   * Fresh material for some parts only, leaving every other part exactly as
   * it is: each part is written in `styleFor(part)` — a new take when it's
   * already that style — keeping its own busyness and range. One pass and one
   * groove update, so several parts can change at once. `newSounds` also
   * swaps in each style's sounds for those parts; otherwise a part keeps its
   * sound (one is built only if it has none).
   */
  const regenerateLayers = (kinds: BankKind[], styleFor: (kind: BankKind) => StyleDef, options: { newSounds?: boolean } = {}) =>
    run(`layers:${kinds.join('+')}`, async () => {
      const groove = state.groove ?? newGroove(styleFor(kinds[0]!))
      const layers = { ...groove.layers }
      for (const kind of kinds) {
        const style = styleFor(kind)
        const bank = getBank(state, kind)
        const current = layers[kind]
        let sound = bank.sound
        let pads: Array<{ music: PadMusic | null }> = visibleBankPads(state, bank)
        const missing = kind === 'drums' ? sound?.type !== 'kit' : sound === null
        if (missing || options.newSounds) {
          sound = styleSound(style, kind)
          const build = await buildBank(bank, sound, { key: state.key, padLayout: state.padLayout, samples: state.samples })
          dispatch({ type: 'APPLY_BANK_BUILDS', builds: [build], remap: 'index' })
          pads = build.pads
        }
        const layer: GrooveLayer = {
          styleId: style.id,
          take: current?.styleId === style.id ? current.take + 1 : 0,
          intensity: current?.intensity ?? DEFAULT_INTENSITY,
          ...(current?.range ? { range: current.range } : {}),
        }
        layers[kind] = layer
        writeLayer(state, dispatch, groove, bank, layer, sound, pads)
      }
      dispatch({ type: 'SET_GROOVE', groove: { ...groove, layers } })
    })

  /** Rewrites a layer that already exists, synchronously — cheap enough to follow a slider live. */
  const rewrite = (kind: BankKind, change: Partial<GrooveLayer>) => {
    const groove = state.groove
    const current = groove?.layers[kind]
    if (!groove || !current || busyJob) return
    const layer = { ...current, ...change }
    const bank = getBank(state, kind)
    writeLayer(state, dispatch, groove, bank, layer, bank.sound, visibleBankPads(state, bank))
    dispatch({ type: 'SET_GROOVE', groove: { ...groove, layers: { ...groove.layers, [kind]: layer } } })
  }

  const newTake = (kind: BankKind) => {
    const current = state.groove?.layers[kind]
    if (current) rewrite(kind, { take: current.take + 1 })
  }

  const setIntensity = (kind: BankKind, intensity: number) => rewrite(kind, { intensity: Math.max(0, Math.min(1, intensity)) })

  /** How many of the bank's keys (or drums) the layer spreads across: 0 the style's own … 1 all of them. */
  const setRange = (kind: BankKind, range: number) => rewrite(kind, { range: Math.max(0, Math.min(1, range)) })

  /** Takes parts out: their steps and their layers, in one groove update. Works on steps you drew too. */
  const clearLayers = (kinds: BankKind[]) => {
    const groove = state.groove
    const pattern = state.patterns.find((item) => item.id === state.activePatternId)
    if (!pattern || busyJob) return
    for (const kind of kinds) dispatch({ type: 'WRITE_BANK_PATTERN', bankId: getBank(state, kind).id, patternId: pattern.id, stepsByPadIndex: {}, minStepCount: pattern.stepCount })
    if (!groove) return
    const layers = { ...groove.layers }
    for (const kind of kinds) delete layers[kind]
    dispatch({ type: 'SET_GROOVE', groove: { ...groove, layers } })
  }

  const clearLayer = (kind: BankKind) => clearLayers([kind])

  /** Writes every preset layer to follow `progression` — one groove update. */
  const followProgression = (groove: Groove, progression: number[]) => {
    const next: Groove = { ...groove, progression }
    for (const kind of BANK_KINDS) {
      const layer = next.layers[kind]
      if (!layer) continue
      const bank = getBank(state, kind)
      writeLayer(state, dispatch, next, bank, layer, bank.sound, visibleBankPads(state, bank))
    }
    dispatch({ type: 'SET_GROOVE', groove: next })
  }

  /** A different progression from the chords layer's style (else any layer's), and every preset layer rewritten to follow it. */
  const newChords = () =>
    run('chords:progression', () => {
      const groove = state.groove
      if (!groove) return
      const style = beatStyle(groove)
      const options = style.progressions.filter((progression) => progression.join() !== groove.progression.join())
      const pool = options.length > 0 ? options : style.progressions
      followProgression(groove, pool[Math.floor(Math.random() * pool.length)]!)
    })

  /** A chosen progression, every preset layer rewritten to follow it. */
  const setChords = (progression: number[]) =>
    run('chords:progression', () => {
      if (state.groove) followProgression(state.groove, progression)
    })

  /**
   * The beat's length: every layer is rewritten over the new number of bars
   * (the chords spread across it). Starts the pattern over, so it is for a
   * fully generated beat — nothing locked, nothing drawn by hand.
   */
  const setLength = (bars: 1 | 2 | 4) =>
    run('length', () => {
      const groove = state.groove
      const pattern = state.patterns.find((item) => item.id === state.activePatternId)
      if (!groove || !pattern || groove.bars === bars) return
      engine.setSequencerPlaybackEnabled(false)
      engine.stopAllSounds()
      dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: false })
      const next: Groove = { ...groove, bars }
      dispatch({ type: 'START_PATTERN', patternId: pattern.id, stepCount: bars * 16 })
      const fresh = { ...state, patterns: state.patterns.map((item) => (item.id === pattern.id ? { ...item, stepCount: bars * 16 } : item)) }
      for (const kind of BANK_KINDS) {
        const layer = next.layers[kind]
        if (!layer) continue
        const bank = getBank(state, kind)
        writeLayer(fresh, dispatch, next, bank, layer, bank.sound, visibleBankPads(state, bank))
      }
      dispatch({ type: 'SET_GROOVE', groove: next })
    })

  /** Rewrites several layers at once — one groove update, so none is lost to a stale snapshot (a slider for every part at a time). */
  const rewriteMany = (kinds: BankKind[], change: Partial<GrooveLayer>) => {
    const groove = state.groove
    if (!groove || busyJob) return
    const layers = { ...groove.layers }
    for (const kind of kinds) {
      const current = layers[kind]
      if (!current) continue
      const layer = { ...current, ...change }
      const bank = getBank(state, kind)
      writeLayer(state, dispatch, groove, bank, layer, bank.sound, visibleBankPads(state, bank))
      layers[kind] = layer
    }
    dispatch({ type: 'SET_GROOVE', groove: { ...groove, layers } })
  }

  const setIntensityFor = (kinds: BankKind[], intensity: number) => rewriteMany(kinds, { intensity: Math.max(0, Math.min(1, intensity)) })

  const setRangeFor = (kinds: BankKind[], range: number) => rewriteMany(kinds, { range: Math.max(0, Math.min(1, range)) })

  const hearBeat = () => {
    engine.getContext()
    engine.setSequencerPlaybackEnabled(false)
    engine.stopAllSounds()
    const section = state.songSections.find((item) => item.id === state.transport.auditionSectionId && item.patternId === state.activePatternId)
    if (section) dispatch({ type: 'AUDITION_SONG_SECTION', sectionId: section.id, scope: 'loop' })
    else {
      dispatch({ type: 'SET_PLAY_MODE', mode: 'pattern' })
      dispatch({ type: 'SET_LOOP_MODE', loopMode: 'continuous' })
      dispatch({ type: 'SET_TRANSPORT_PLAYING', isPlaying: true })
    }
  }

  const varyBeat = (intensity?: number) => run('variation', () => {
    const groove = state.groove
    if (!groove) return
    const layers = { ...groove.layers }
    for (const kind of BANK_KINDS) {
      const current = layers[kind]
      if (!current) continue
      const layer = { ...current, take: current.take + 1, intensity: intensity ?? current.intensity }
      const bank = getBank(state, kind)
      writeLayer(state, dispatch, groove, bank, layer, bank.sound, visibleBankPads(state, bank))
      layers[kind] = layer
    }
    dispatch({ type: 'SET_GROOVE', groove: { ...groove, layers } })
    hearBeat()
  })

  return { busy, error, hearBeat, varyBeat, startBeat, regenerateLayers, setLayerStyle, newTake, setIntensity, setRange, setIntensityFor, setRangeFor, clearLayer, clearLayers, newChords, setChords, setLength }
}
