import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

interface ConfirmDialogProps {
  message: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  cancelLabel?: string
  confirmDisabled?: boolean
  cancelDisabled?: boolean
}

/**
 * Every "are you sure?" prompt in the app — replacing a pad/pattern, loading
 * a project, deleting a sample or instrument — shares this one component
 * instead of dropping an inline `.confirm-overwrite` block into whatever
 * panel raised it. Portals straight to `document.body` with its own fixed,
 * centered backdrop, the same reasoning `<Overlay>` uses for its own portal
 * (see that component's doc comment) but centered rather than bottom-sheet-
 * positioned, and at a higher z-index than `.overlay-backdrop`: a confirm is
 * very often raised from *inside* an already-open Overlay (a picker, the pad
 * library picker, settings), and needs to read as a distinct decision
 * layered on top of that sheet, not more content inside it.
 */
export function ConfirmDialog({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  cancelLabel = 'Cancel',
  confirmDisabled = false,
  cancelDisabled = false,
}: ConfirmDialogProps) {
  return createPortal(
    <div
      className="confirm-dialog-backdrop"
      onClick={cancelDisabled ? undefined : onCancel}
    >
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={cancelDisabled}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={confirmDisabled}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
