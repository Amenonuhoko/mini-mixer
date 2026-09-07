import { useEffect } from 'react'

/** Browser-native "leave site?" prompt — no custom message is possible in modern browsers. */
export function useWarnBeforeUnload(shouldWarn: boolean): void {
  useEffect(() => {
    if (!shouldWarn) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [shouldWarn])
}
