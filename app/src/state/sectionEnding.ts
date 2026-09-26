import { varyPattern } from '../styles/variations'
import type { AppState, Pattern, SongSection, TransitionMove } from './types'

export const TRANSITION_MOVES: { id: TransitionMove; label: string; hint: string; needs?: string }[] = [
  { id: 'fill', label: 'Drum fill', hint: 'Snare and toms fill the last beat.', needs: 'Needs a snare, clap or tom in Drums.' },
  { id: 'build', label: 'Build', hint: 'A snare roll speeds up over the last bar.', needs: 'Needs a snare or clap in Drums.' },
  { id: 'pause', label: 'Cut out', hint: 'Everything stops for the last beat.' },
  { id: 'bass-drop', label: 'Bass drop', hint: 'The bass drops out for the last beat.', needs: 'Needs bass playing in the last beat.' },
]

export const TRANSITION_MOVE_IDS: readonly TransitionMove[] = TRANSITION_MOVES.map((move) => move.id)

/** The section whose pattern holds `sectionId`'s ending: itself, or the ending split off right after it. */
export function endingCarrier(sections: SongSection[], sectionId: string): SongSection | undefined {
  const index = sections.findIndex((section) => section.id === sectionId)
  const section = sections[index]
  if (!section) return undefined
  if (section.ending) return section
  const next = sections[index + 1]
  return next?.ending?.of === section.id ? next : undefined
}

/** The pattern an ending is written onto: the one it was made from, else the section's own. */
export function endingBase(state: Pick<AppState, 'patterns' | 'songSections'>, sectionId: string): Pattern | undefined {
  const section = state.songSections.find((item) => item.id === sectionId)
  const carrier = endingCarrier(state.songSections, sectionId)
  const find = (id: string | undefined) => state.patterns.find((pattern) => pattern.id === id)
  return find(carrier?.ending?.basePatternId) ?? find(carrier?.patternId) ?? find(section?.patternId)
}

/** Whether a move changes anything here (a fill needs a drum sound to play it). */
export function canApplyMove(state: AppState, sectionId: string, move: TransitionMove): boolean {
  const base = endingBase(state, sectionId)
  return !!base && JSON.stringify(varyPattern(state, base, move, [], 0).steps) !== JSON.stringify(base.steps)
}

/**
 * Writes a transition into the steps of the pattern a section ends on, or
 * takes it out again (`move` null). The ending always gets a pattern of its
 * own, so no other section changes: a section that repeats has its final
 * repeat split off as "<name> ending", and a single pass is pointed at a copy.
 * Picking another move rewrites the ending from the pattern it was made from.
 * `ids` name whatever gets created, so previewing again reuses them.
 */
export function withSectionEnding(
  state: AppState,
  sectionId: string,
  move: TransitionMove | null,
  ids: { section: string; pattern: string },
): Pick<AppState, 'patterns' | 'songSections' | 'activePatternId'> | null {
  const sections = state.songSections
  const section = sections.find((item) => item.id === sectionId)
  if (!section) return null
  const carrier = endingCarrier(sections, sectionId)
  const hasPattern = (id: string, patterns: Pattern[]) => patterns.some((pattern) => pattern.id === id)

  if (move === null) {
    if (!carrier?.ending) return null
    const { ending, ...plain } = carrier
    const baseId = ending.basePatternId
    const owner = sections[sections.findIndex((item) => item.id === carrier.id) - 1]
    let songSections: SongSection[]
    if (!hasPattern(baseId, state.patterns)) songSections = sections.map((item) => item.id === carrier.id ? plain : item)
    else if (owner && owner.id === ending.of && owner.patternId === baseId) {
      // Fold the split-off repeat back into the section it came from.
      songSections = sections.flatMap((item) => item.id === carrier.id ? [] : item.id === owner.id ? [{ ...item, repeats: Math.min(32, item.repeats + 1) }] : [item])
    } else songSections = sections.map((item) => item.id === carrier.id ? { ...plain, patternId: baseId } : item)
    // The ending's pattern goes too, once nothing plays it.
    const patterns = songSections.some((item) => item.patternId === carrier.patternId)
      ? state.patterns
      : state.patterns.filter((pattern) => pattern.id !== carrier.patternId)
    const activePatternId = hasPattern(state.activePatternId, patterns) ? state.activePatternId : hasPattern(baseId, patterns) ? baseId : patterns[0]?.id ?? ''
    return { patterns, songSections, activePatternId }
  }

  const base = endingBase(state, sectionId)
  if (!base) return null
  const baked = varyPattern(state, base, move, [], 0)
  if (JSON.stringify(baked.steps) === JSON.stringify(base.steps)) return null
  const basePatternId = carrier?.ending && hasPattern(carrier.ending.basePatternId, state.patterns) ? carrier.ending.basePatternId : base.id

  if (carrier) {
    // Rewrite the ending in place, unless another section plays the same pattern.
    const shared = sections.some((item) => item.id !== carrier.id && item.patternId === carrier.patternId)
    const current = state.patterns.find((pattern) => pattern.id === carrier.patternId)
    const name = current?.name ?? `${carrier.name || 'Section'} ending`
    const patternId = shared ? ids.pattern : carrier.patternId
    const pattern: Pattern = { ...baked, id: patternId, name }
    return {
      patterns: shared ? [...state.patterns, pattern] : state.patterns.map((item) => item.id === patternId ? pattern : item),
      songSections: sections.map((item) => item.id === carrier.id ? { ...item, patternId, ending: { ...item.ending, move, basePatternId } } : item),
      activePatternId: state.activePatternId,
    }
  }

  const name = `${section.name || 'Section'} ending`
  const pattern: Pattern = { ...baked, id: ids.pattern, name }
  const songSections = section.repeats > 1
    ? sections.flatMap((item) => item.id !== section.id ? [item] : [
      { ...item, repeats: item.repeats - 1 },
      { ...item, id: ids.section, name, patternId: ids.pattern, repeats: 1, ending: { move, basePatternId, of: section.id } },
    ])
    : sections.map((item) => item.id === section.id ? { ...item, patternId: ids.pattern, ending: { move, basePatternId } } : item)
  return { patterns: [...state.patterns, pattern], songSections, activePatternId: state.activePatternId }
}
