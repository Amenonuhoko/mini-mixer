import type { AppState } from '../state/types'

/** What Play starts right now: an edited section's loop, a section preview, the song, or the pattern. */
export function playScope(state: AppState): string {
  const auditioning = Boolean(state.transport.auditionSectionId)
  const sectionLoop = auditioning && state.transport.auditionScope === 'loop'
  const editingSection = state.songSections.find((section) => section.id === state.transport.auditionSectionId)
  if (sectionLoop) return `${editingSection?.name || 'section'} section`
  if (auditioning) return 'preview'
  return state.transport.playMode === 'song' ? 'song' : 'pattern'
}
