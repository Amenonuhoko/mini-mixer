import type { AppState, BankKind, Pattern, SongSection } from '../state/types'

/** Old songs have no mix settings, so every bank starts at full level. */
export function sectionBankLevel(section: SongSection, bank: BankKind): number {
  const value = section.bankVolumes?.[bank]
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value)) / 100
    : 1
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
