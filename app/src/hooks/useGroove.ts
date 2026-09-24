import { useState } from 'react'
import { buildBank } from '../engine/bankBuilder'
import { DRUM_KITS } from '../engine/drumSynth'
import { moodById } from '../music/theory'
import { useAppState } from '../state/AppStateContext'
import { getBank, visibleBankPads } from '../state/banks'
import type { AppState, Bank, BankKind, BankSound, Groove, PadMusic } from '../state/types'
import { beatBpm, generateLayer, styleStepCount, type LayerSteps, type LayerTarget } from '../styles/generator'
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

/** Repeats a layer across a pattern longer than the style's own length. */
function tile(steps: LayerSteps, layerLength: number, patternLength: number): LayerSteps {
  const repeats = Math.max(1, Math.floor(patternLength / layerLength))
  return Object.fromEntries(
    Object.entries(steps).map(([pad, list]) => [
      pad,
      Array.from({ length: repeats }, (_, r) => list.map((step) => step + r * layerLength)).flat(),
    ]),
  )
}

export function bankHasSteps(state: AppState, bank: Bank): boolean {
  const pattern = state.patterns.find((item) => item.id === state.activePatternId)
  return !!pattern && bank.padIds.some((padId) => (pattern.steps[padId] ?? []).some((cell) => cell !== null))
}

/**
 * Turns a style (src/styles) into a beat.
 *
 * - startBeat: a whole new beat — the style's tempo, a mood that suits it
 *   (the current one, if the style fits it), every bank's sound, and all
 *   four layers written onto a fresh pattern, sharing one progression.
 * - addLayer: writes (or rewrites, as a new take) one bank's layer in the
 *   style, leaving the others alone. A bank without a suitable sound gets the
 *   style's; a sound the user picked is kept.
 *
 * Sounds render asynchronously; `busy` names the job so the UI can wait.
 */
export function useGroove() {
  const { state, dispatch } = useAppState()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label)
    setError(null)
    try {
      await work()
    } catch (caught) {
      console.error(caught)
      setError(caught instanceof Error ? caught.message : 'Could not build that beat')
    } finally {
      setBusy(null)
    }
  }

  const startBeat = (style: StyleDef) =>
    run(`start:${style.id}`, async () => {
      const pattern = state.patterns.find((item) => item.id === state.activePatternId)
      if (!pattern) return
      const seed = newSeed()
      const keepMood = state.mood !== null && style.moods.includes(state.mood)
      const mood = keepMood ? state.mood! : style.moods[0]!
      const key = keepMood ? state.key : moodById(mood).key
      const builds = await Promise.all(
        state.banks.map((bank) =>
          buildBank(bank, styleSound(style, bank.kind), { key, padLayout: state.padLayout, samples: state.samples }),
        ),
      )
      const stepCount = styleStepCount(style)
      dispatch({ type: 'APPLY_BANK_BUILDS', builds, remap: 'index', key, mood })
      dispatch({ type: 'SET_BPM', bpm: beatBpm(style, seed) })
      dispatch({ type: 'START_PATTERN', patternId: pattern.id, stepCount })
      for (const build of builds) {
        const bank = state.banks.find((item) => item.id === build.bankId)!
        const steps = generateLayer({ style, key, seed, take: 0 }, layerTarget(bank, build.sound, build.pads))
        dispatch({ type: 'WRITE_BANK_PATTERN', bankId: bank.id, patternId: pattern.id, stepsByPadIndex: steps, minStepCount: stepCount })
      }
      dispatch({ type: 'SET_GROOVE', groove: { styleId: style.id, seed, takes: {} } })
    })

  const addLayer = (style: StyleDef, kind: BankKind) =>
    run(`${kind}:${style.id}`, async () => {
      const pattern = state.patterns.find((item) => item.id === state.activePatternId)
      if (!pattern) return
      const groove: Groove =
        state.groove?.styleId === style.id ? state.groove : { styleId: style.id, seed: newSeed(), takes: {} }
      const bank = getBank(state, kind)
      // A take only advances once the layer exists, so the first add is the style's "take 0".
      const take = bankHasSteps(state, bank) ? (groove.takes[kind] ?? 0) + 1 : (groove.takes[kind] ?? 0)

      let sound = bank.sound
      let pads: Array<{ music: PadMusic | null }> = visibleBankPads(state, bank)
      const needsSound = kind === 'drums' ? sound?.type !== 'kit' : sound === null
      if (needsSound) {
        sound = styleSound(style, kind)
        const build = await buildBank(bank, sound, { key: state.key, padLayout: state.padLayout, samples: state.samples })
        dispatch({ type: 'APPLY_BANK_BUILDS', builds: [build], remap: 'index' })
        pads = build.pads
      }

      const layerLength = styleStepCount(style)
      const patternLength = Math.max(pattern.stepCount, layerLength)
      const steps = tile(generateLayer({ style, key: state.key, seed: groove.seed, take }, layerTarget(bank, sound, pads)), layerLength, patternLength)
      dispatch({ type: 'WRITE_BANK_PATTERN', bankId: bank.id, patternId: pattern.id, stepsByPadIndex: steps, minStepCount: layerLength })
      dispatch({ type: 'SET_GROOVE', groove: { ...groove, takes: { ...groove.takes, [kind]: take } } })
      dispatch({ type: 'SET_ACTIVE_BANK', bankId: bank.id })
    })

  return { busy, error, startBeat, addLayer }
}
