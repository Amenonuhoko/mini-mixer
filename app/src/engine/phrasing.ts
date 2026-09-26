import type { Bank, BankKind, Pad, Pattern, Phrasing } from '../state/types'

export const WIND_INSTRUMENTS = new Set(['Flute', 'Clarinet', 'Trumpet', 'Alto Saxophone'])
export function isWind(bank: Bank): boolean { return bank.sound?.type === 'preset' && WIND_INSTRUMENTS.has(bank.sound.name) }

export function bankPhrasing(pattern: Pattern, bank: Bank): Phrasing {
  const instrument = bank.sound?.type === 'preset' ? bank.sound.name : ''
  const detached = isWind(bank) || bank.kind === 'bass' || ['Bass', 'Sub Bass'].includes(instrument)
  const sustained = ['Organ', 'Pad', 'Lead', 'Velvet Strings'].includes(instrument)
  return pattern.phrasing?.[bank.kind] ?? {
    articulation: detached ? 'detached' : sustained ? 'connected' : 'natural',
    lengthSteps: 0,
    dynamics: isWind(bank) ? 45 : 0,
  }
}

export function normalizePhrasing(value: unknown): Pattern['phrasing'] {
  if (!value || typeof value !== 'object') return undefined
  const result: Partial<Record<BankKind, Phrasing>> = {}
  for (const kind of ['drums', 'bass', 'chords', 'melody'] as const) {
    const item = (value as Record<string, unknown>)[kind] as Partial<Phrasing> | undefined
    if (!item || !['natural', 'short', 'detached', 'connected'].includes(item.articulation ?? '')) continue
    result[kind] = {
      articulation: item.articulation!,
      lengthSteps: [0, 1, 2, 4, 8, 16].includes(item.lengthSteps ?? -1) ? item.lengthSteps! : 0,
      dynamics: typeof item.dynamics === 'number' && Number.isFinite(item.dynamics) ? Math.max(0, Math.min(100, item.dynamics)) : 0,
    }
  }
  return result
}

export interface NotePerformance {
  level: number
  /** Wall-clock duration including release. Absent = original sample length. */
  durationSeconds?: number
  attackSeconds?: number
  releaseSeconds?: number
}

/** One cheap plan shared by live playback and bounce; no extra audio nodes. */
export function planPhrasing(pattern: Pattern, banks: Bank[], pads: Pad[], bpm: number): Map<string, Array<NotePerformance | undefined>> {
  const result = new Map<string, Array<NotePerformance | undefined>>()
  const audible = new Set(pads.filter((pad) => !pad.muted).map((pad) => pad.id))
  const secondsPerStep = 60 / bpm / 4
  for (const bank of banks) {
    const settings = bankPhrasing(pattern, bank)
    const ids = bank.padIds.slice(0, bank.visibleCount).filter((id) => audible.has(id))
    const onsets = Array.from({ length: pattern.stepCount }, (_, step) => ids.some((id) => !!pattern.steps[id]?.[step]))
    for (const id of ids) {
      result.set(id, Array.from({ length: pattern.stepCount }, (_, step) => {
        if (!pattern.steps[id]?.[step]) return undefined
        let next = step + 1
        // End at the pattern boundary, so a note cannot leak into a removed
        // bank or a different song section. Never fill a rest by looping audio.
        while (next < pattern.stepCount && !onsets[next]) next++
        const phraseLength = Math.min(pattern.stepCount, 32)
        const phraseEnd = step - step % phraseLength + phraseLength - 2
        const breathEnd = isWind(bank) && step < phraseEnd ? phraseEnd : pattern.stepCount
        const available = Math.min(next - step, settings.lengthSteps || 8, breathEnd - step)
        const amount = settings.dynamics / 100
        const accent = step % 4 === 0 ? 1 : step % 2 === 0 ? .88 : .73
        // Stable across edits, repeats and exports; timing and pitch stay exact.
        const nuance = ((step * 17 + bank.kind.length * 13) % 11) / 10
        const level = 1 - amount * (1 - accent + nuance * .12)
        if (settings.articulation === 'natural') return { level }
        const fraction = settings.articulation === 'short' ? .42 : settings.articulation === 'detached' ? .82 : 1
        const steps = settings.articulation === 'short' ? Math.min(available, 2) : available
        const durationSeconds = Math.max(.025, steps * secondsPerStep * fraction)
        return {
          level, durationSeconds,
          attackSeconds: settings.articulation === 'connected' ? .008 + amount * .008 : .002,
          releaseSeconds: Math.min(durationSeconds * .3, settings.articulation === 'short' ? .018 : .055),
        }
      }))
    }
  }
  return result
}
