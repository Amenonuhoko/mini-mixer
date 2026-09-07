import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

interface OverlayProps {
  onClose: () => void
  children: ReactNode
}

/**
 * Shared modal wrapper for every popup in the app — portals into
 * document.body rather than rendering in place. .app-shell is
 * `position: fixed` (see index.css's scroll-architecture note), which per
 * spec makes it its own stacking context; a popup rendered as its descendant
 * (which is most of them — they're opened from buttons inside page
 * components) would be trapped inside that context. z-index only competes
 * within the nearest stacking context, not across one, so a trapped popup
 * can end up visually and interactively *underneath* a fixed sibling of
 * .app-shell — the FAB cluster or the Sequencer's PlayBar — despite the
 * popup's own z-index being far higher. Portaling to document.body sidesteps
 * the whole problem: the popup is never actually a DOM descendant of
 * .app-shell, so it can't be trapped in its stacking context.
 */
export function Overlay({ onClose, children }: OverlayProps) {
  return createPortal(
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="overlay-sheet" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
