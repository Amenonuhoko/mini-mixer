import { useEffect, useRef, useState, type ReactNode } from 'react'

interface InfoTipProps {
  /** aria-label for the icon button, e.g. "About Pitch". */
  label: string
  children: ReactNode
}

/**
 * A small tap-to-toggle "what does this do" bubble. Deliberately tap-based, not
 * hover-based — hover doesn't exist on a phone, which is this app's primary
 * target. Also carries a native `title` so desktop hover works too, for free.
 */
export function InfoTip({ label, children }: InfoTipProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const handleOutside = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', handleOutside)
    return () => window.removeEventListener('pointerdown', handleOutside)
  }, [open])

  return (
    <span className="info-tip" ref={containerRef}>
      <button
        type="button"
        className="info-tip-btn"
        aria-label={label}
        aria-expanded={open}
        title={typeof children === 'string' ? children : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        i
      </button>
      {open && (
        <span className="info-tip-bubble" role="tooltip">
          {children}
        </span>
      )}
    </span>
  )
}
