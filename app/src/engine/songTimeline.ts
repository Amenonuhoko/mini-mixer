import type { AppState, BankKind, Pattern, SongSection } from '../state/types'

/** Old songs have no mix settings, so every bank starts at full level. */
export function sectionBankLevel(section: SongSection, bank: BankKind): number {
  const value = section.bankVolumes?.[bank]
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value)) / 100
    : 1
}

/** Audible gain also accounts for a bank removed from this song section. */
export function sectionBankGain(section: SongSection, bank: BankKind): number {
  return section.excludedBanks?.includes(bank) ? 0 : sectionBankLevel(section, bank)
}

export interface SongSpan {
  section: SongSection
  pattern: Pattern
  startStep: number
  endStep: number
}

export function buildSongTimeline(state: Pick<AppState, 'patterns' | 'songSections'>): SongSpan[] {
  const patterns = new Map(state.patterns.map((pattern) => [pattern.id, pattern]))
  const spans: SongSpan[] = []
  let startStep = 0
  for (const section of state.songSections) {
    const pattern = patterns.get(section.patternId)
    if (!pattern) continue
    const length = pattern.stepCount * section.repeats
    if (length <= 0) continue
    spans.push({ section, pattern, startStep, endStep: startStep + length })
    startStep += length
  }
  return spans
}

export function songStepAt(
  spans: SongSpan[],
  step: number,
): { span: SongSpan; patternStep: number } | null {
  const span = spans.find((item) => step >= item.startStep && step < item.endStep)
  return span ? { span, patternStep: (step - span.startStep) % span.pattern.stepCount } : null
}

/**
 * Where a section's transition is heard: its last two bars (a lead-in, then
 * the ending) and the first bar of the next section. End is exclusive.
 */
export function handoverRange(spans: SongSpan[], sectionId: string): { start: number; end: number } | null {
  const index = spans.findIndex((span) => span.section.id === sectionId)
  const span = spans[index]
  if (!span) return null
  const next = spans[index + 1]
  return {
    start: Math.max(span.startStep, span.endStep - 32),
    end: next ? Math.min(next.endStep, next.startStep + Math.min(16, next.pattern.stepCount)) : span.endStep,
  }
}

/** A pattern's Pitch for a bank, in cents — whole semitones, ±12 (an octave). */
export function patternPitchCents(pattern: Pattern, bank: BankKind | undefined): number {
  const semitones = bank ? pattern.pitch?.[bank] : undefined
  return typeof semitones === 'number' && Number.isFinite(semitones) ? Math.max(-12, Math.min(12, Math.round(semitones))) * 100 : 0
}
