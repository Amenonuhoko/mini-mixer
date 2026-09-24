import { useState } from 'react'
import { buildBank, rebuildMelodicBanks } from '../engine/bankBuilder'
import { SCALES, type MoodId, type MusicalKey, type PadLayout } from '../music/theory'
import { useAppState } from '../state/AppStateContext'
import type { Bank, BankSound } from '../state/types'

/**
 * Everything that re-renders a bank's sounds: picking a bank's sound, and
 * changing the project key/mood or pad layout (which rebuilds every melodic
 * bank that has a sound). Rendering is async; the result lands in one
 * APPLY_BANK_BUILDS so pads, samples and programmed steps change together.
 * `busy` names what's rendering so the caller can disable itself meanwhile.
 */
export function useBankBuilder() {
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
      setError(caught instanceof Error ? caught.message : 'Could not build that sound')
    } finally {
      setBusy(null)
    }
  }

  const setBankSound = (bank: Bank, sound: BankSound, label: string) =>
    run(label, async () => {
      const build = await buildBank(bank, sound, { key: state.key, padLayout: state.padLayout, samples: state.samples })
      dispatch({ type: 'APPLY_BANK_BUILDS', builds: [build], remap: 'index' })
    })

  const setKey = (key: MusicalKey, mood: MoodId | null, label: string) =>
    run(label, async () => {
      const builds = await rebuildMelodicBanks(state, key, state.padLayout)
      // Same-sized scales keep each step on its pad (same degree, new key);
      // otherwise the grid's shape changes, so steps go to the nearest pitch.
      const sameShape = SCALES[key.scale].intervals.length === SCALES[state.key.scale].intervals.length
      dispatch({ type: 'APPLY_BANK_BUILDS', builds, remap: sameShape ? 'index' : 'pitch', key, mood })
    })

  const setPadLayout = (padLayout: PadLayout) =>
    run(padLayout, async () => {
      const builds = await rebuildMelodicBanks(state, state.key, padLayout)
      dispatch({ type: 'APPLY_BANK_BUILDS', builds, remap: 'pitch', padLayout })
    })

  return { busy, error, setBankSound, setKey, setPadLayout }
}
