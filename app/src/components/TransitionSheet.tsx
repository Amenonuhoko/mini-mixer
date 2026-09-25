import { useAppState } from '../state/AppStateContext'
import { Overlay } from './Overlay'

interface TransitionSheetProps {
  sectionId: string
  onClose: () => void
}

/**
 * How a song section ends and leads into the next one — a fill, a drop, a
 * pause, a build. Opened from the section's mix on the Song page; the
 * controls themselves are still to be built.
 */
export function TransitionSheet({ sectionId, onClose }: TransitionSheetProps) {
  const { state } = useAppState()
  const index = state.songSections.findIndex((section) => section.id === sectionId)
  const section = state.songSections[index]
  const next = state.songSections[index + 1]
  if (!section) return null
  const from = section.name || `Section ${index + 1}`
  return (
    <Overlay
      onClose={onClose}
      title="Ending / transition"
      subtitle={next ? `${from} → ${next.name || `Section ${index + 2}`}` : `${from} → end of the song`}
    >
      <section className="sheet-section">
        <p className="muted">
          Coming soon: shape how {from} ends and hands over to {next ? next.name || 'the next section' : 'the end of the song'} — fills, drops, pauses and builds.
        </p>
      </section>
    </Overlay>
  )
}
