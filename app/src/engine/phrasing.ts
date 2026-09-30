import { MAX_STEP_COUNT } from '../state/constants'
import type { Bank, BankKind, NoteEdit, Pad, Pattern, Phrasing } from '../state/types'

export const WIND_INSTRUMENTS = new Set(['Flute', 'Clarinet', 'Trumpet', 'Alto Saxophone', 'Oboe', 'Bassoon', 'French Horn', 'Trombone', 'Harmonica'])
export function isWind(bank: Bank): boolean { return bank.sound?.type === 'preset' && WIND_INSTRUMENTS.has(bank.sound.name) }

export function bankPhrasing(pattern: Pattern, bank: Bank): Phrasing {
  const instrument = bank.sound?.type === 'preset' ? bank.sound.name : ''
  const detached = isWind(bank) || bank.kind === 'bass' || ['Bass', 'Sub Bass', 'Upright Bass'].includes(instrument)
  const sustained = ['Organ', 'Pipe Organ', 'Pad', 'Lead', 'Synth Brass', 'Velvet Strings', 'Cello'].includes(instrument)
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
  /** Play the sound faster or slower (pitch follows) so it lasts exactly this long. */
  stretchToSeconds?: number
}

/** The longest fade a single note can be given, in steps (one bar). */
export const MAX_NOTE_FADE_STEPS = 16
/** A stretched sound never plays slower than a quarter or faster than four times its speed. */
const STRETCH_LIMIT = 4

const whole = (value: number, max: number) => (Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(value))) : 0)

/** What a Select-tool change sets: a number to set a property (0 removes it), or nothing to leave it. */
export type NoteEditChange = { [Key in keyof NoteEdit]?: NoteEdit[Key] | undefined }

/** A note's edit after `change`; undefined when nothing is left set. A stretch only means something with a length. */
export function mergeNoteEdit(current: NoteEdit | undefined, change: NoteEditChange): NoteEdit | undefined {
  const fadeIn = change.fadeInSteps === undefined ? current?.fadeInSteps : whole(change.fadeInSteps, MAX_NOTE_FADE_STEPS)
  const fadeOut = change.fadeOutSteps === undefined ? current?.fadeOutSteps : whole(change.fadeOutSteps, MAX_NOTE_FADE_STEPS)
  const length = change.lengthSteps === undefined ? current?.lengthSteps : whole(change.lengthSteps, MAX_STEP_COUNT)
  const stretch = change.stretch === undefined ? current?.stretch : change.stretch === true
  const edit: NoteEdit = {
    ...(fadeIn ? { fadeInSteps: fadeIn } : {}),
    ...(fadeOut ? { fadeOutSteps: fadeOut } : {}),
    ...(length ? { lengthSteps: length } : {}),
    ...(length && stretch ? { stretch: true } : {}),
  }
  return Object.keys(edit).length > 0 ? edit : undefined
}

/** The saved edits of a pattern made safe: whole, bounded values, on lit steps that exist. Undefined when none are left. */
export function normalizeNoteEdits(value: unknown, steps: Record<string, Array<string | null>>, stepCount: number): Pattern['noteEdits'] {
  if (!value || typeof value !== 'object') return undefined
  const result: NonNullable<Pattern['noteEdits']> = {}
  for (const [padId, row] of Object.entries(value as Record<string, unknown>)) {
    if (!row || typeof row !== 'object') continue
    const kept: Record<string, NoteEdit> = {}
    for (const [key, raw] of Object.entries(row as Record<string, unknown>)) {
      const index = Number(key)
      if (!Number.isInteger(index) || index < 0 || index >= stepCount || !steps[padId]?.[index] || !raw || typeof raw !== 'object') continue
      const edit = mergeNoteEdit(undefined, raw as NoteEditChange)
      if (edit) kept[String(index)] = edit
    }
    if (Object.keys(kept).length > 0) result[padId] = kept
  }
  return Object.keys(result).length > 0 ? result : undefined
}

/**
 * How long a note sounds, and how much faster its sound plays (1 = as it is),
 * given how long it would last untouched. Shared by live playback and the
 * bounce so they cannot disagree.
 */
export function noteTiming(naturalSeconds: number, performance?: Pick<NotePerformance, 'durationSeconds' | 'stretchToSeconds'>): { seconds: number; rateScale: number } {
  const target = performance?.stretchToSeconds
  const rateScale = target && target > 0 ? Math.max(1 / STRETCH_LIMIT, Math.min(STRETCH_LIMIT, naturalSeconds / target)) : 1
  return { seconds: Math.min(naturalSeconds / rateScale, performance?.durationSeconds ?? Infinity), rateScale }
}

/** Puts a step's own edit over what its bank's phrasing planned for it. `stepsToEnd` is how many steps the pattern has left from the onset. */
function applyNoteEdit(note: NotePerformance, edit: NoteEdit, secondsPerStep: number, stepsToEnd: number): NotePerformance {
  const result = { ...note }
  if (edit.lengthSteps) {
    const seconds = Math.max(.025, Math.min(edit.lengthSteps, stepsToEnd) * secondsPerStep)
    result.durationSeconds = seconds
    // A held note ends with a short release of its own, unless it is given a fade-out below.
    result.releaseSeconds = Math.min(seconds * .3, .055)
    if (edit.stretch) result.stretchToSeconds = seconds
  }
  if (edit.fadeInSteps) result.attackSeconds = edit.fadeInSteps * secondsPerStep
  if (edit.fadeOutSteps) result.releaseSeconds = edit.fadeOutSteps * secondsPerStep
  return result
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
        const edit = pattern.noteEdits?.[id]?.[String(step)]
        const shaped = (note: NotePerformance) => (edit ? applyNoteEdit(note, edit, secondsPerStep, pattern.stepCount - step) : note)
        if (settings.articulation === 'natural') return shaped({ level })
        const fraction = settings.articulation === 'short' ? .42 : settings.articulation === 'detached' ? .82 : 1
        const steps = settings.articulation === 'short' ? Math.min(available, 2) : available
        const durationSeconds = Math.max(.025, steps * secondsPerStep * fraction)
        return shaped({
          level, durationSeconds,
          attackSeconds: settings.articulation === 'connected' ? .008 + amount * .008 : .002,
          releaseSeconds: Math.min(durationSeconds * .3, settings.articulation === 'short' ? .018 : .055),
        })
      }))
    }
  }
  return result
}
