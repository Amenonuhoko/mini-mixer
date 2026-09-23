import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from './icons'

interface OverlayProps {
  onClose: () => void
  /** Sheet heading. Every sheet gets the same header — title, optional subtitle, close button — so they all read as one system. */
  title?: ReactNode
  subtitle?: ReactNode
  /** Extra class for sheet-specific sizing (e.g. the pad editor's taller sheet). */
  className?: string
  children: ReactNode
}

/**
 * Shared modal sheet for every popup in the app — portals into
 * document.body rather than rendering in place. .app-shell is
 * `position: fixed` (see index.css's scroll-architecture note), which per
 * spec makes it its own stacking context; a popup rendered as its descendant
 * (which is most of them — they're opened from buttons inside page
 * components) would be trapped inside that context. z-index only competes
 * within the nearest stacking context, not across one, so a trapped popup
 * can end up visually and interactively *underneath* a fixed sibling of
 * .app-shell — the transport strip or the tab bar — despite the popup's own
 * z-index being far higher. Portaling to document.body sidesteps the whole
 * problem: the popup is never actually a DOM descendant of .app-shell, so it
 * can't be trapped in its stacking context.
 */
export function Overlay({ onClose, title, subtitle, className, children }: OverlayProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return createPortal(
    <div className="overlay-backdrop" onClick={onClose}>
      <div
        className={className ? `sheet ${className}` : 'sheet'}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        {title !== undefined && (
          <header className="sheet-head">
            <div className="sheet-titles">
              <h2 className="sheet-title">{title}</h2>
              {subtitle && <p className="sheet-subtitle">{subtitle}</p>}
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </header>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}
