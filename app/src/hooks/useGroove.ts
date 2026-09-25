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
    { style, key: state.key, seed: groove.seed, take: layer.take, bars: groove.bars, progression: groove.progression, intensity: layer.intensity },
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
 * - newChords: a new progression — every preset layer is rewritten to follow.
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
      const builds = await Promise.all(
        state.banks.filter((bank) => !options.keepSounds || !bank.sound).map((bank) => buildBank(bank, styleSound(style, bank.kind), { key, padLayout: state.padLayout, samples: state.samples })),
      )
      if (builds.length) dispatch({ type: 'APPLY_BANK_BUILDS', builds, remap: 'index', key, mood })
      dispatch({ type: 'SET_BPM', bpm: beatBpm(style, groove.seed) })
      dispatch({ type: 'START_PATTERN', patternId: pattern.id, stepCount: groove.bars * 16 })
      const kinds = options.kinds ?? BANK_KINDS
      const layer: GrooveLayer = { styleId: style.id, take: 0, intensity: options.intensity ?? DEFAULT_INTENSITY }
      const fresh = { ...state, key, patterns: state.patterns.map((item) => (item.id === pattern.id ? { ...item, stepCount: groove.bars * 16 } : item)) }
      for (const bank of state.banks) {
        const build = builds.find((item) => item.bankId === bank.id)
        if (kinds.includes(bank.kind)) writeLayer(fresh, dispatch, groove, bank, layer, build?.sound ?? bank.sound, build?.pads ?? visibleBankPads(state, bank))
      }
      dispatch({ type: 'SET_GROOVE', groove: { ...groove, layers: Object.fromEntries(kinds.map((kind) => [kind, layer])) } })
    })

  const setLayerStyle = (kind: BankKind, style: StyleDef) =>
    run(`${kind}:${style.id}`, async () => {
      const groove = state.groove ?? newGroove(style)
      const current = groove.layers[kind]
      const layer: GrooveLayer = {
        styleId: style.id,
        take: current?.styleId === style.id ? current.take + 1 : 0,
        intensity: current?.intensity ?? DEFAULT_INTENSITY,
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

  const clearLayer = (kind: BankKind) => {
    const groove = state.groove
    const pattern = state.patterns.find((item) => item.id === state.activePatternId)
    if (!groove || !pattern || busyJob) return
    dispatch({ type: 'WRITE_BANK_PATTERN', bankId: getBank(state, kind).id, patternId: pattern.id, stepsByPadIndex: {}, minStepCount: pattern.stepCount })
    const { [kind]: _removed, ...layers } = groove.layers
    dispatch({ type: 'SET_GROOVE', groove: { ...groove, layers } })
  }

  /** A different progression from the chords layer's style (else any layer's), and every preset layer rewritten to follow it. */
  const newChords = () =>
    run('chords:progression', () => {
      const groove = state.groove
      if (!groove) return
      const styleId = groove.layers.chords?.styleId ?? Object.values(groove.layers)[0]?.styleId
      const style = (styleId && styleById(styleId)) || STYLES[0]!
      const options = style.progressions.filter((progression) => progression.join() !== groove.progression.join())
      const pool = options.length > 0 ? options : style.progressions
      const next: Groove = { ...groove, progression: pool[Math.floor(Math.random() * pool.length)]! }
      for (const kind of BANK_KINDS) {
        const layer = next.layers[kind]
        if (!layer) continue
        const bank = getBank(state, kind)
        writeLayer(state, dispatch, next, bank, layer, bank.sound, visibleBankPads(state, bank))
      }
      dispatch({ type: 'SET_GROOVE', groove: next })
    })

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

  return { busy, error, hearBeat, varyBeat, startBeat, setLayerStyle, newTake, setIntensity, clearLayer, newChords }
}
